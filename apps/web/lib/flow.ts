"use client";

import { privateKeyToAccount } from "viem/accounts";
import { parseSignature, keccak256, encodeAbiParameters } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  buildReceiveAuthorizationTypedData,
  canonicalizeLedger,
  ledgerToCanonicalJson,
  ledgerHash as computeLedgerHash,
  settlementId as computeSettlementId,
  assertSettlementCurrency,
  type CanonicalLedger,
} from "@finaltab/engine";
import type { Person, FrozenLedgerState, SignedTransfer } from "./types";
import { resolveDemoKeys } from "./demoKeys";

/** The three demo signers, in the order the UI renders them. */
export const DEMO_SEED: ReadonlyArray<readonly [string, string]> = [
  ["vee", "Vee"],
  ["hem", "Hem"],
  ["ravi", "Ravi"],
];

/**
 * Demo signers: real secp256k1 keys generated in the browser, real EIP-712
 * signatures — just throwaway identities with no funds. Clearly labelled in
 * the UI. Swappable for injected wallets without touching the flow.
 *
 * Keys are regenerated on every call by default, so the addresses change on
 * each reload. Set `NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS=1` to pin them to
 * localStorage instead — the only way to fund a demo debtor and still have that
 * address exist after a refresh. See `lib/demoKeys.ts` for the caveats.
 */
export function makeDemoPeople(): Person[] {
  const keys = resolveDemoKeys({ ids: DEMO_SEED.map(([id]) => id) });
  return DEMO_SEED.map(([id, name]) => {
    const pk = keys[id]!;
    const account = privateKeyToAccount(pk);
    return { id, name, address: account.address, demoPrivateKey: pk };
  });
}

/** One hour of signature validity from freeze time. */
const AUTH_VALIDITY_SECONDS = 3600n;

/**
 * Freeze is the last point before money becomes signable, so the currency
 * check lives here as well as on the server. A non-USD ledger must never
 * acquire a ledgerHash — once it has one, it is signable and executable.
 */
export function freezeLedger(
  people: Person[],
  debts: Array<{ debtor: string; creditor: string; usdcMinor: string }>,
  receiptId: string,
  currency: string,
): FrozenLedgerState {
  assertSettlementCurrency(currency);
  const byId = new Map(people.map((p) => [p.id, p]));
  const transfers = debts.map((d) => {
    const from = byId.get(d.debtor);
    const to = byId.get(d.creditor);
    if (!from || !to) throw new Error(`Unknown participant in debt: ${d.debtor} -> ${d.creditor}`);
    return { from: from.address, to: to.address, value: BigInt(d.usdcMinor) };
  });

  const ledger: CanonicalLedger = {
    version: 1,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    participants: people.map((p) => ({ id: p.id, address: p.address, displayName: p.name })),
    transfers,
    receiptIds: [receiptId],
  };

  const canonical = canonicalizeLedger(ledger);
  const hash = computeLedgerHash(canonical);
  return {
    canonicalJson: ledgerToCanonicalJson(canonical),
    ledgerHash: hash,
    settlementId: computeSettlementId(hash),
    transfers: canonical.transfers.map((t) => ({ from: t.from, to: t.to, value: t.value.toString() })),
  };
}

/** Derive receive authorization nonce from ledgerHash, debtor, and amount. */
function receiveNonce(ledgerHash: `0x${string}`, from: `0x${string}`, value: bigint): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [ledgerHash, from, value],
    ),
  );
}

/**
 * Sign every transfer as a ReceiveWithAuthorization to the settlement contract.
 * Debtors sign authorization to pull funds TO the settlement contract.
 * Nonces derive from ledger hash + debtor + amount, binding to this settlement only.
 */
export async function signAllTransfers(people: Person[], frozen: FrozenLedgerState): Promise<SignedTransfer[]> {
  console.log("[signAllTransfers] Starting with", frozen.transfers.length, "transfers");
  const byAddress = new Map(people.map((p) => [p.address.toLowerCase(), p]));
  const settlementContract = (process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT || "") as `0x${string}`;
  if (!settlementContract) throw new Error("NEXT_PUBLIC_SETTLEMENT_CONTRACT not configured");
  console.log("[signAllTransfers] Contract:", settlementContract);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = 0n;
  const validBefore = now + AUTH_VALIDITY_SECONDS;

  const out: SignedTransfer[] = [];
  for (let i = 0; i < frozen.transfers.length; i++) {
    const t = frozen.transfers[i]!;
    console.log(`[signAllTransfers] Transfer ${i}:`, t);
    const person = byAddress.get(t.from.toLowerCase());
    if (!person?.demoPrivateKey) throw new Error(`No demo key for debtor ${t.from}`);
    console.log(`[signAllTransfers] Found person:`, person.name, person.address);
    const account = privateKeyToAccount(person.demoPrivateKey);
    console.log(`[signAllTransfers] Created account:`, account.address);

    const value = BigInt(t.value);
    const nonce = receiveNonce(frozen.ledgerHash, t.from, value);
    const typed = buildReceiveAuthorizationTypedData({
      from: t.from,
      to: settlementContract,
      value,
      validAfter,
      validBefore,
      nonce,
    });
    console.log(`[signAllTransfers] Built typed data, about to sign...`);
    const signature = await account.signTypedData(typed);
    console.log(`[signAllTransfers] Got signature:`, signature);
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
  console.log("[signAllTransfers] Completed successfully with", out.length, "signatures");
  return out;
}

/**
 * Who gets paid, and how much.
 *
 * Signing rewrites every authorization's recipient to the settlement contract,
 * so the actual creditors survive only on the frozen ledger. The contract pulls
 * into itself and then pays this list out, reverting unless the two sides match
 * to the cent — so this must be derived from the same transfers that were
 * signed, never from anything the user can edit afterwards.
 *
 * Sorted by address so the payload is deterministic for a given frozen ledger.
 */
export function derivePayouts(
  transfers: ReadonlyArray<{ to: string; value: string }>,
): Array<{ creditor: string; value: string }> {
  const byCreditor = new Map<string, bigint>();
  for (const t of transfers) {
    byCreditor.set(t.to, (byCreditor.get(t.to) ?? 0n) + BigInt(t.value));
  }
  return [...byCreditor.entries()]
    .sort(([a], [b]) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
    .map(([creditor, value]) => ({ creditor, value: value.toString() }));
}

export function shortHex(hex: string, chars = 6): string {
  return hex.length <= 2 + chars * 2 ? hex : `${hex.slice(0, 2 + chars)}…${hex.slice(-chars)}`;
}

export function formatUsdcMinor(minor: string): string {
  const v = BigInt(minor);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole}.${frac}`;
}
