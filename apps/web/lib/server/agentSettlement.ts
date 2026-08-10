import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  createPublicClient,
  http,
  erc20Abi,
  keccak256,
  encodeAbiParameters,
  parseSignature,
  formatEther,
} from "viem";
import {
  BASE_SEPOLIA_USDC,
  buildReceiveAuthorizationTypedData,
  canonicalizeLedger,
  ledgerToCanonicalJson,
  ledgerHash as computeLedgerHash,
  settlementId as computeSettlementId,
  nettedTransfers,
  parseFiat,
  type CanonicalLedger,
} from "@finaltab/engine";

/**
 * Server-side agent settlement: lets the MCP surface run the SAME freeze →
 * sign → settle pipeline the web lab uses, with the demo signer keys held
 * server-side (env vars, never NEXT_PUBLIC, never logged).
 *
 * These are throwaway Base Sepolia identities holding faucet USDC. The env
 * gate doubles as the capability switch: no keys, no money movement — the
 * read/compute tools keep working either way.
 */

export const AGENT_SIGNERS = [
  { id: "vee", name: "Vee", envVar: "FINALTAB_AGENT_KEY_VEE" },
  { id: "hem", name: "Hem", envVar: "FINALTAB_AGENT_KEY_HEM" },
  { id: "ravi", name: "Ravi", envVar: "FINALTAB_AGENT_KEY_RAVI" },
] as const;

export type AgentSignerId = (typeof AGENT_SIGNERS)[number]["id"];

export const AGENT_SIGNER_IDS = AGENT_SIGNERS.map((s) => s.id) as AgentSignerId[];

/**
 * KeeperHub's executor on Base Sepolia — the `from` observed on every live
 * settlement tx (0x7bf655f3…, 0xac6d32e5…). Self-funded by KeeperHub, so gas
 * for settle calls never depends on our wallets.
 */
export const KEEPERHUB_RELAYER = "0xdcf4bac4bd805948168ff63483bc493894a29613" as const;

/** USD cents → USDC minor units. USD is the only currency this app settles. */
const USD_CENT_TO_USDC_MINOR = 10_000n;

const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

export type SignerKeyStatus = "PRESENT" | "MISSING" | "MALFORMED";

export interface AgentSignerResolution {
  /** null unless every signer resolved to a valid key. */
  accounts: Map<AgentSignerId, PrivateKeyAccount> | null;
  status: Record<AgentSignerId, SignerKeyStatus>;
}

/**
 * Dev fallback: the gitignored local key file the live-settle script uses.
 * Absent from any deployment (deploys come from git), so production relies on
 * env vars alone. Never log the contents.
 */
function localKeyFile(): Record<string, string> {
  for (const base of [process.cwd(), resolve(process.cwd(), "..", "..")]) {
    try {
      const raw = readFileSync(resolve(base, "proof-output", "demo-signers.local.json"), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // keep looking; fallback is best-effort only
    }
  }
  return {};
}

/**
 * Resolve one signing account per demo identity. Env var wins; a malformed
 * env value is reported as MALFORMED rather than silently falling back, so a
 * deployment misconfiguration stays loud. Key values never leave this module.
 */
export function resolveAgentSigners(): AgentSignerResolution {
  const status = {} as Record<AgentSignerId, SignerKeyStatus>;
  const accounts = new Map<AgentSignerId, PrivateKeyAccount>();
  let fileKeys: Record<string, string> | null = null;

  for (const signer of AGENT_SIGNERS) {
    const fromEnv = process.env[signer.envVar];
    if (fromEnv !== undefined) {
      if (!PRIVATE_KEY_RE.test(fromEnv)) {
        status[signer.id] = "MALFORMED";
        continue;
      }
      accounts.set(signer.id, privateKeyToAccount(fromEnv as `0x${string}`));
      status[signer.id] = "PRESENT";
      continue;
    }
    fileKeys ??= localKeyFile();
    const fromFile = fileKeys[signer.id];
    if (fromFile && PRIVATE_KEY_RE.test(fromFile)) {
      accounts.set(signer.id, privateKeyToAccount(fromFile as `0x${string}`));
      status[signer.id] = "PRESENT";
    } else {
      status[signer.id] = "MISSING";
    }
  }

  const allPresent = AGENT_SIGNERS.every((s) => status[s.id] === "PRESENT");
  return { accounts: allPresent ? accounts : null, status };
}

export interface AgentDebt {
  debtor: AgentSignerId;
  creditor: AgentSignerId;
  /** USD decimal string, max 2 decimal places, e.g. "4.20". */
  amountUsd: string;
}

export interface PreparedAgentSettlement {
  ledgerHash: `0x${string}`;
  settlementId: `0x${string}`;
  canonicalJson: string;
  receiptRef: string;
  participants: Array<{ id: string; name: string; address: `0x${string}` }>;
  /** Netted transfers in USDC minor units, at most n-1 of them. */
  transfers: Array<{ fromId: string; toId: string; from: `0x${string}`; to: `0x${string}`; value: string }>;
  /** Aggregated by creditor, sorted by address — must sum to the pulls exactly. */
  payouts: Array<{ creditor: `0x${string}`; value: string }>;
}

/**
 * Debts → netted transfers → frozen canonical ledger. Pure given the address
 * map and receiptRef: the same inputs always produce the same settlementId,
 * and the contract's executed[] map makes any replay revert.
 */
export function prepareAgentSettlement(
  debts: AgentDebt[],
  addressById: Record<AgentSignerId, `0x${string}`>,
  receiptRef?: string,
): PreparedAgentSettlement {
  if (debts.length === 0) throw new Error("no debts supplied");

  const involved = new Set<AgentSignerId>();
  const parsed = debts.map((d) => {
    if (d.debtor === d.creditor) throw new Error(`self-debt not allowed: ${d.debtor}`);
    involved.add(d.debtor);
    involved.add(d.creditor);
    const cents = parseFiat(d.amountUsd);
    if (cents <= 0n) throw new Error(`non-positive debt amount: ${d.amountUsd}`);
    return { debtor: d.debtor, creditor: d.creditor, amount: cents * USD_CENT_TO_USDC_MINOR };
  });

  const netted = nettedTransfers(parsed);
  if (netted.length === 0) throw new Error("debts net to zero — nothing to settle");

  const participants = AGENT_SIGNERS.filter((s) => involved.has(s.id)).map((s) => ({
    id: s.id,
    name: s.name,
    address: addressById[s.id],
  }));

  const ref = receiptRef ?? `mcp-agent:${new Date().toISOString()}`;
  const ledger: CanonicalLedger = {
    version: 1,
    chainId: 84532,
    token: BASE_SEPOLIA_USDC,
    participants: participants.map((p) => ({ id: p.id, address: p.address, displayName: p.name })),
    transfers: netted.map((t) => ({
      from: addressById[t.debtor as AgentSignerId],
      to: addressById[t.creditor as AgentSignerId],
      value: t.amount,
    })),
    receiptIds: [ref],
  };

  const canonical = canonicalizeLedger(ledger);
  const hash = computeLedgerHash(canonical);

  const byCreditor = new Map<string, bigint>();
  for (const t of canonical.transfers) {
    byCreditor.set(t.to, (byCreditor.get(t.to) ?? 0n) + t.value);
  }
  const payouts = [...byCreditor.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([creditor, value]) => ({ creditor: creditor as `0x${string}`, value: value.toString() }));

  const addressToId = new Map(participants.map((p) => [p.address.toLowerCase(), p.id]));
  return {
    ledgerHash: hash,
    settlementId: computeSettlementId(hash),
    canonicalJson: ledgerToCanonicalJson(canonical),
    receiptRef: ref,
    participants,
    transfers: canonical.transfers.map((t) => ({
      fromId: addressToId.get(t.from)!,
      toId: addressToId.get(t.to)!,
      from: t.from,
      to: t.to,
      value: t.value.toString(),
    })),
    payouts,
  };
}

export interface AgentSignedTransfer {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

/** Same nonce derivation the web lab and the proven live-settle leg use. */
export function receiveNonce(
  ledgerHash: `0x${string}`,
  from: `0x${string}`,
  value: bigint,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [ledgerHash, from, value],
    ),
  );
}

const AUTH_VALIDITY_SECONDS = 3600n;

/**
 * Sign every netted transfer as a ReceiveWithAuthorization pulling INTO the
 * settlement contract. Real EIP-712 signatures over the real USDC domain —
 * the exact payload the contract forwards to USDC on Base Sepolia.
 */
export async function signPreparedTransfers(
  prepared: PreparedAgentSettlement,
  accounts: Map<AgentSignerId, PrivateKeyAccount>,
  settlementContract: `0x${string}`,
): Promise<AgentSignedTransfer[]> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = 0n;
  const validBefore = now + AUTH_VALIDITY_SECONDS;

  const out: AgentSignedTransfer[] = [];
  for (const t of prepared.transfers) {
    const account = accounts.get(t.fromId as AgentSignerId);
    if (!account) throw new Error(`no signing account for debtor ${t.fromId}`);
    if (account.address.toLowerCase() !== t.from.toLowerCase()) {
      throw new Error(`key/address mismatch for ${t.fromId}`);
    }
    const value = BigInt(t.value);
    const nonce = receiveNonce(prepared.ledgerHash, t.from, value);
    const signature = await account.signTypedData(
      buildReceiveAuthorizationTypedData({
        from: t.from,
        to: settlementContract,
        value,
        validAfter,
        validBefore,
        nonce,
      }),
    );
    const { v, r, s } = parseSignature(signature);
    out.push({
      from: t.from,
      to: settlementContract,
      value: t.value,
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

/** "4200000" minor units → "4.20". */
export function formatUsdcMinor(minor: string | bigint): string {
  const v = BigInt(minor);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

function chainClient() {
  const rpc = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  return createPublicClient({ transport: http(rpc) });
}

export interface ChainSnapshot {
  chain: "base-sepolia";
  usdcToken: `0x${string}`;
  signers: Array<{ id: string; name: string; address: `0x${string}`; usdc: string }>;
  settlementContract: { address: `0x${string}`; retainedUsdc: string };
  relayer: { address: `0x${string}`; eth: string };
}

/** Live balances straight from Base Sepolia RPC — no cache, no mock. */
export async function agentChainSnapshot(
  signerAddresses: Array<{ id: string; name: string; address: `0x${string}` }>,
  settlementContract: `0x${string}`,
): Promise<ChainSnapshot> {
  const client = chainClient();
  const balanceOf = (address: `0x${string}`) =>
    client.readContract({
      address: BASE_SEPOLIA_USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });

  const [signerBalances, contractBalance, relayerEth] = await Promise.all([
    Promise.all(signerAddresses.map((s) => balanceOf(s.address))),
    balanceOf(settlementContract),
    client.getBalance({ address: KEEPERHUB_RELAYER }),
  ]);

  return {
    chain: "base-sepolia",
    usdcToken: BASE_SEPOLIA_USDC,
    signers: signerAddresses.map((s, i) => ({
      ...s,
      usdc: formatUsdcMinor(signerBalances[i]!),
    })),
    settlementContract: { address: settlementContract, retainedUsdc: formatUsdcMinor(contractBalance) },
    relayer: { address: KEEPERHUB_RELAYER, eth: formatEther(relayerEth) },
  };
}
