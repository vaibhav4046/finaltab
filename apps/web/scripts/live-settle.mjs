#!/usr/bin/env node
/**
 * live-settle.mjs — run one REAL executeSettlement through the production API.
 *
 * Flow: build frozen V2 plan → sign EIP-3009 authorization + FINALTab
 * plan consent per aggregated debtor
 * → POST /api/settle/simulate → POST /api/settle/execute → poll
 * /api/settle/status/{id} to terminal → fail-closed on-chain verification of the
 * receipt (USDC Transfer logs + SettlementExecuted + balance deltas).
 *
 * Exits 0 only when the chain itself proves the settlement. Never prints keys.
 *
 * Usage: node apps/web/scripts/live-settle.mjs --contract 0xV2Address [--base-url https://finaltab.vercel.app]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { concat, keccak256, toHex, encodeAbiParameters, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const PROOF_DIR = resolve(REPO_ROOT, "proof-output");

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : "https://finaltab.vercel.app";

const RPC = "https://sepolia.base.org";
const CHAIN_ID = 84532;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const contractFlag = process.argv.includes("--contract")
  ? process.argv[process.argv.indexOf("--contract") + 1]
  : process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT;
if (!contractFlag || !/^0x[0-9a-fA-F]{40}$/.test(contractFlag)) {
  throw new Error("Pass the deployed V2 address with --contract or NEXT_PUBLIC_SETTLEMENT_CONTRACT");
}
const SETTLEMENT_CONTRACT = contractFlag;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// keccak256("SettlementExecuted(bytes32,bytes32,uint256,uint256,uint256)")
const SETTLEMENT_EXECUTED_TOPIC = keccak256(
  toHex("SettlementExecuted(bytes32,bytes32,uint256,uint256,uint256)"),
);

const PEOPLE = [
  { id: "vee", displayName: "Vee", address: "0x8edD1eB1e3522a1e9D6db7ce82Ad5F2ADB59192c" },
  { id: "hem", displayName: "Hem", address: "0x07918AB993d701e286cD2f3AF65ab7502B25550B" },
  { id: "ravi", displayName: "Ravi", address: "0x8db7a6bb7146450CA03C5F6Bb3511fF66c5Ef172" },
];

// Ledger: dinner receipt split three ways, vee paid. hem owes 4.20, ravi owes 3.80.
// USDC minor units (6 dp). sum(debts) == payout to vee == 8.000000. §5 holds.
const LEDGER_TRANSFERS = [
  { from: "0x07918AB993d701e286cD2f3AF65ab7502B25550B", to: "0x8edD1eB1e3522a1e9D6db7ce82Ad5F2ADB59192c", value: 4200000n },
  { from: "0x8db7a6bb7146450CA03C5F6Bb3511fF66c5Ef172", to: "0x8edD1eB1e3522a1e9D6db7ce82Ad5F2ADB59192c", value: 3800000n },
];
const RECEIPT_IDS = ["live-demo-dinner-2026-08-10-v2"];

// ---------- canonical ledger hashing (mirrors packages/engine/src/ledger.ts) ----------

const lower = (a) => a.toLowerCase();

function ledgerToCanonicalJson() {
  const participants = PEOPLE
    .map((p) => ({ id: p.id, address: lower(p.address), displayName: p.displayName }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return JSON.stringify({
    version: 1,
    chainId: CHAIN_ID,
    token: lower(USDC),
    participants,
    transfers: LEDGER_TRANSFERS.map((t) => ({ from: lower(t.from), to: lower(t.to), value: t.value.toString() })),
    receiptIds: [...RECEIPT_IDS].sort(),
  });
}

const ledgerHash = keccak256(toHex(ledgerToCanonicalJson()));

function aggregatePlan() {
  const debitByAddress = new Map();
  const payoutByAddress = new Map();
  for (const transfer of LEDGER_TRANSFERS) {
    const from = lower(transfer.from);
    const to = lower(transfer.to);
    debitByAddress.set(from, (debitByAddress.get(from) ?? 0n) + transfer.value);
    payoutByAddress.set(to, (payoutByAddress.get(to) ?? 0n) + transfer.value);
  }
  return {
    debits: [...debitByAddress.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([debtor, value]) => ({ debtor, value })),
    payouts: [...payoutByAddress.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([creditor, value]) => ({ creditor, value })),
  };
}

const PLAN_TYPEHASH = keccak256(
  toHex("SettlementPlan(uint256 chainId,address settlementContract,address token,bytes32 ledgerHash,bytes32 debitsHash,bytes32 payoutsHash)"),
);
const DEBIT_TYPEHASH = keccak256(toHex("Debit(address debtor,uint256 value)"));
const PAYOUT_TYPEHASH = keccak256(toHex("Payout(address creditor,uint256 value)"));

function hashVector(hashes) {
  return keccak256(hashes.length === 0 ? "0x" : concat(hashes));
}

const { debits: PLAN_DEBITS, payouts: PLAN_PAYOUTS } = aggregatePlan();
const debitsHash = hashVector(
  PLAN_DEBITS.map((debit) =>
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [DEBIT_TYPEHASH, debit.debtor, debit.value],
      ),
    ),
  ),
);
const payoutsHash = hashVector(
  PLAN_PAYOUTS.map((payout) =>
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [PAYOUT_TYPEHASH, payout.creditor, payout.value],
      ),
    ),
  ),
);
const settlementId = keccak256(
  encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [PLAN_TYPEHASH, BigInt(CHAIN_ID), SETTLEMENT_CONTRACT, USDC, ledgerHash, debitsHash, payoutsHash],
  ),
);

/** V2 nonce: keccak(abi.encode(planHash, debtor, aggregateDebit)). */
function receiveNonce(from, value) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [settlementId, from, value],
    ),
  );
}

// ---------- EIP-3009 signing (mirrors packages/engine/src/eip3009.ts) ----------

const USDC_DOMAIN = { name: "USDC", version: "2", chainId: CHAIN_ID, verifyingContract: USDC };
const RECEIVE_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
const CONSENT_DOMAIN = {
  name: "FINALTab Settlement",
  version: "2",
  chainId: CHAIN_ID,
  verifyingContract: SETTLEMENT_CONTRACT,
};
const CONSENT_TYPES = {
  SettlementConsent: [
    { name: "planHash", type: "bytes32" },
    { name: "debtor", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
};

async function signTransfers() {
  const keys = JSON.parse(readFileSync(resolve(PROOF_DIR, "demo-signers.local.json"), "utf8"));
  const byAddress = new Map(PEOPLE.map((p) => [lower(p.address), p.id]));
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const out = [];
  for (const debit of PLAN_DEBITS) {
    const personId = byAddress.get(lower(debit.debtor));
    const pk = keys[personId];
    if (!pk) throw new Error(`no demo key for ${personId}`);
    const account = privateKeyToAccount(pk);
    if (lower(account.address) !== lower(debit.debtor)) {
      throw new Error(`key/address mismatch for ${personId}`);
    }
    const nonce = receiveNonce(debit.debtor, debit.value);
    const authorization = {
      from: debit.debtor,
      to: SETTLEMENT_CONTRACT,
      value: debit.value,
      validAfter,
      validBefore,
      nonce,
    };
    const authSignature = parseSignature(await account.signTypedData({
      domain: USDC_DOMAIN,
      types: RECEIVE_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message: authorization,
    }));
    const consentSignature = parseSignature(await account.signTypedData({
      domain: CONSENT_DOMAIN,
      types: CONSENT_TYPES,
      primaryType: "SettlementConsent",
      message: {
        planHash: settlementId,
        debtor: debit.debtor,
        value: debit.value,
        validAfter,
        validBefore,
      },
    }));
    out.push({
      from: debit.debtor,
      to: SETTLEMENT_CONTRACT,
      value: debit.value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
      authV: Number(authSignature.v ?? 27n),
      authR: authSignature.r,
      authS: authSignature.s,
      consentV: Number(consentSignature.v ?? 27n),
      consentR: consentSignature.r,
      consentS: consentSignature.s,
    });
  }
  return out;
}

/** Mirrors apps/web/lib/flow.ts derivePayouts: aggregate ledger transfers by creditor, sort by address. */
function derivePayouts() {
  return PLAN_PAYOUTS.map(({ creditor, value }) => ({ creditor, value: value.toString() }));
}

// ---------- HTTP + RPC helpers ----------

async function api(method, path, body) {
  const headers = { Origin: new URL(BASE_URL).origin };
  if (body) headers["Content-Type"] = "application/json";
  if (process.env.FINALTAB_MCP_TOKEN) {
    headers.Authorization = `Bearer ${process.env.FINALTAB_MCP_TOKEN}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response — leave null */
  }
  return { status: res.status, json };
}

async function signBroadcastApproval(challenge) {
  if (!challenge?.artifact || typeof challenge.message !== "string") {
    throw new Error("approval challenge response is malformed");
  }
  const keys = JSON.parse(readFileSync(resolve(PROOF_DIR, "demo-signers.local.json"), "utf8"));
  const debtor = PLAN_DEBITS[0];
  const personId = PEOPLE.find((person) => lower(person.address) === lower(debtor.debtor))?.id;
  const privateKey = personId ? keys[personId] : null;
  if (!privateKey) throw new Error("no demo key for the broadcast approver");
  const account = privateKeyToAccount(privateKey);
  if (lower(account.address) !== lower(debtor.debtor)) throw new Error("broadcast approver key/address mismatch");
  return { ...challenge.artifact, signature: await account.signMessage({ message: challenge.message }) };
}

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

async function usdcBalance(addr) {
  const data = "0x70a08231" + addr.slice(2).toLowerCase().padStart(64, "0");
  return BigInt(await rpc("eth_call", [{ to: USDC, data }, "latest"]));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt6 = (v) => `${v / 1000000n}.${(v % 1000000n).toString().padStart(6, "0")}`;

function findTxHash(obj) {
  // Search the status body for a 66-char hex hash under a tx-ish key.
  const seen = new Set();
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && /tx|transaction|hash/i.test(k)) {
        return v;
      }
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

// ---------- main ----------

async function main() {
  mkdirSync(PROOF_DIR, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    settlementId,
    ledgerHash,
    verdict: "UNPROVEN",
    steps: [],
  };
  const step = (name, data) => {
    report.steps.push({ name, at: new Date().toISOString(), ...data });
    console.log(`[${name}] ${JSON.stringify(data).slice(0, 400)}`);
  };

  try {
    // §5 invariant checks before anything leaves this machine.
    const transfers = await signTransfers();
    const payouts = derivePayouts();
    const pulled = transfers.reduce((a, t) => a + BigInt(t.value), 0n);
    const paid = payouts.reduce((a, p) => a + BigInt(p.value), 0n);
    if (pulled !== paid) throw new Error(`invariant: pulled ${pulled} != paid ${paid}`);
    step("build", {
      settlementId,
      ledgerHash,
      transferCount: transfers.length,
      totalPulledUSDC: fmt6(pulled),
      payouts,
    });

    // Balances before, for delta verification after.
    const before = {};
    for (const p of PEOPLE) before[p.id] = await usdcBalance(p.address);
    step("balances-before", Object.fromEntries(PEOPLE.map((p) => [p.id, fmt6(before[p.id])])));

    const body = { settlementId, ledgerHash, transfers, payouts };

    // 1. Simulate against production. wouldRevert => hard stop.
    const sim = await api("POST", "/api/settle/simulate", body);
    step("simulate", { http: sim.status, ok: sim.json?.ok, wouldRevert: sim.json?.wouldRevert });
    if (sim.status !== 200 || sim.json?.ok !== true) {
      throw new Error(`simulate failed: HTTP ${sim.status} ${JSON.stringify(sim.json).slice(0, 500)}`);
    }

    // 2. Have one signed debtor approve submission of this exact plan. The
    // artifact is retryable until its short expiry; KeeperHub idempotency and
    // V2 settlement state prevent duplicate settlement.
    const approvalChallenge = await api("POST", "/api/settle/approval", {
      settlementId,
      ledgerHash,
      approver: transfers[0].from,
    });
    step("broadcast-approval-challenge", { http: approvalChallenge.status });
    if (approvalChallenge.status !== 200) {
      throw new Error(
        `approval challenge failed: HTTP ${approvalChallenge.status} ${JSON.stringify(approvalChallenge.json).slice(0, 500)}`,
      );
    }
    const approval = await signBroadcastApproval(approvalChallenge.json);

    // 3. Execute through the same simulate-first submit path used by MCP.
    const exec = await api("POST", "/api/settle/execute", { signedSettlement: body, approval });
    step("execute", { http: exec.status, ok: exec.json?.ok });
    if (exec.status !== 200 || exec.json?.ok !== true) {
      throw new Error(`execute failed: HTTP ${exec.status} ${JSON.stringify(exec.json).slice(0, 500)}`);
    }
    const accepted = exec.json.accepted ?? {};
    const executionId =
      accepted.executionId ?? accepted.id ?? accepted.execution?.id ?? null;
    if (!executionId) {
      throw new Error(`no executionId in accept response: ${JSON.stringify(accepted).slice(0, 500)}`);
    }
    report.executionId = executionId;
    step("accepted", { executionId });

    // 4. Poll to terminal via the production status route (server classifies fail-closed).
    const deadline = Date.now() + 240_000;
    let last = null;
    let verdict = null;
    while (Date.now() < deadline) {
      const proofQuery = new URLSearchParams({ settlementId, ledgerHash });
      const st = await api("GET", `/api/settle/status/${executionId}?${proofQuery.toString()}`);
      if (st.status !== 200) {
        step("status-error", { http: st.status, body: JSON.stringify(st.json).slice(0, 300) });
        await sleep(4000);
        continue;
      }
      last = st.json;
      const state = last?.status?.status ?? last?.status?.state ?? "unknown";
      verdict = last?.verdict ?? null;
      step("poll", { state, verdict });
      if (["completed", "failed", "cancelled"].includes(state)) break;
      await sleep(Math.min(Math.max(last?.pollHintMs ?? 3000, 1500), 10_000));
    }
    report.finalStatus = last;

    const finalState = last?.status?.status ?? last?.status?.state ?? "unknown";
    if (finalState !== "completed") {
      throw new Error(`terminal state ${finalState}, verdict ${verdict}`);
    }

    // 4. Fail-closed on-chain verification. The API's word is not enough.
    const txHash = findTxHash(last);
    if (!txHash) throw new Error("no transaction hash in terminal status");
    report.txHash = txHash;

    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (!receipt) throw new Error(`no receipt on chain for ${txHash}`);
    if (receipt.status !== "0x1") throw new Error(`receipt status ${receipt.status} (reverted)`);

    const usdcLogs = receipt.logs.filter(
      (l) => l.address.toLowerCase() === USDC.toLowerCase() && l.topics[0] === TRANSFER_TOPIC,
    );
    const settledLogs = receipt.logs.filter(
      (l) =>
        l.address.toLowerCase() === SETTLEMENT_CONTRACT.toLowerCase() &&
        l.topics[0] === SETTLEMENT_EXECUTED_TOPIC,
    );
    step("receipt", {
      block: parseInt(receipt.blockNumber, 16),
      usdcTransferLogs: usdcLogs.length,
      settlementExecutedLogs: settledLogs.length,
    });
    if (usdcLogs.length < 3) throw new Error(`expected >=3 USDC Transfer logs (2 pulls + 1 payout), got ${usdcLogs.length}`);
    if (settledLogs.length !== 1) throw new Error(`expected 1 SettlementExecuted log, got ${settledLogs.length}`);
    if (settledLogs[0].topics[1]?.toLowerCase() !== settlementId.toLowerCase()) {
      throw new Error(`SettlementExecuted settlementId mismatch: ${settledLogs[0].topics[1]}`);
    }

    // Balance deltas must match the ledger exactly.
    const after = {};
    for (const p of PEOPLE) after[p.id] = await usdcBalance(p.address);
    step("balances-after", Object.fromEntries(PEOPLE.map((p) => [p.id, fmt6(after[p.id])])));
    const deltas = { vee: after.vee - before.vee, hem: after.hem - before.hem, ravi: after.ravi - before.ravi };
    if (deltas.vee !== 8000000n) throw new Error(`vee delta ${deltas.vee}, expected +8000000`);
    if (deltas.hem !== -4200000n) throw new Error(`hem delta ${deltas.hem}, expected -4200000`);
    if (deltas.ravi !== -3800000n) throw new Error(`ravi delta ${deltas.ravi}, expected -3800000`);

    report.verdict = "VERIFIED_SETTLED";
    report.explorer = `https://sepolia.basescan.org/tx/${txHash}`;
    step("VERIFIED_SETTLED", { txHash, executionId, explorer: report.explorer });
    process.exitCode = 0;
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    console.error(`FAILED: ${report.error}`);
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    const file = resolve(PROOF_DIR, `live-settle-${report.startedAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(`report: ${file}`);
  }
}

main();
