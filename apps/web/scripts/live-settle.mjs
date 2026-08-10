#!/usr/bin/env node
/**
 * live-settle.mjs — run one REAL executeSettlement through the production API.
 *
 * Flow: build frozen ledger → sign EIP-3009 ReceiveWithAuthorization per debtor
 * → POST /api/settle/simulate → POST /api/settle/execute → poll
 * /api/settle/status/{id} to terminal → fail-closed on-chain verification of the
 * receipt (USDC Transfer logs + SettlementExecuted + balance deltas).
 *
 * Exits 0 only when the chain itself proves the settlement. Never prints keys.
 *
 * Usage: node apps/web/scripts/live-settle.mjs [--base-url https://finaltab.vercel.app]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toHex, encodeAbiParameters, parseSignature } from "viem";
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
const SETTLEMENT_CONTRACT = "0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64";
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
const settlementId = keccak256(encodeAbiParameters([{ type: "bytes32" }], [ledgerHash]));

/** Mirrors apps/web/lib/flow.ts receiveNonce: keccak(abi.encode(ledgerHash, from, value)). */
function receiveNonce(from, value) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [ledgerHash, from, value],
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

async function signTransfers() {
  const keys = JSON.parse(readFileSync(resolve(PROOF_DIR, "demo-signers.local.json"), "utf8"));
  const byAddress = new Map(PEOPLE.map((p) => [lower(p.address), p.id]));
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const out = [];
  for (const t of LEDGER_TRANSFERS) {
    const personId = byAddress.get(lower(t.from));
    const pk = keys[personId];
    if (!pk) throw new Error(`no demo key for ${personId}`);
    const account = privateKeyToAccount(pk);
    if (lower(account.address) !== lower(t.from)) {
      throw new Error(`key/address mismatch for ${personId}`);
    }
    const nonce = receiveNonce(t.from, t.value);
    const signature = await account.signTypedData({
      domain: USDC_DOMAIN,
      types: RECEIVE_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message: {
        from: t.from,
        to: SETTLEMENT_CONTRACT,
        value: t.value,
        validAfter,
        validBefore,
        nonce,
      },
    });
    const { v, r, s } = parseSignature(signature);
    out.push({
      from: t.from,
      to: SETTLEMENT_CONTRACT,
      value: t.value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
      v: Number(v ?? 27n),
      r,
      s,
    });
  }
  return out;
}

/** Mirrors apps/web/lib/flow.ts derivePayouts: aggregate ledger transfers by creditor, sort by address. */
function derivePayouts() {
  const byCreditor = new Map();
  for (const t of LEDGER_TRANSFERS) {
    const key = lower(t.to);
    byCreditor.set(key, (byCreditor.get(key) ?? 0n) + t.value);
  }
  return [...byCreditor.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([creditor, value]) => ({ creditor, value: value.toString() }));
}

// ---------- HTTP + RPC helpers ----------

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
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

    // 2. Execute.
    const exec = await api("POST", "/api/settle/execute", body);
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

    // 3. Poll to terminal via the production status route (server classifies fail-closed).
    const deadline = Date.now() + 240_000;
    let last = null;
    let verdict = null;
    while (Date.now() < deadline) {
      const st = await api("GET", `/api/settle/status/${executionId}`);
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
