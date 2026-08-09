"use client";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseSignature } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  buildTransferAuthorizationTypedData,
  canonicalizeLedger,
  ledgerToCanonicalJson,
  ledgerHash as computeLedgerHash,
  settlementId as computeSettlementId,
  transferNonce,
  type CanonicalLedger,
} from "@finaltab/engine";
import type { Person, FrozenLedgerState, SignedTransfer } from "./types";

/**
 * Demo signers: real secp256k1 keys generated in the browser, real EIP-712
 * signatures — just throwaway identities with no funds. Clearly labelled in
 * the UI. Swappable for injected wallets without touching the flow.
 */
export function makeDemoPeople(): Person[] {
  const seed: Array<[string, string]> = [
    ["vee", "Vee"],
    ["hem", "Hem"],
    ["ravi", "Ravi"],
  ];
  return seed.map(([id, name]) => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    return { id, name, address: account.address, demoPrivateKey: pk };
  });
}

/** One hour of signature validity from freeze time. */
const AUTH_VALIDITY_SECONDS = 3600n;

export function freezeLedger(
  people: Person[],
  debts: Array<{ debtor: string; creditor: string; usdcMinor: string }>,
  receiptId: string,
): FrozenLedgerState {
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

/**
 * Sign every transfer with its debtor's demo key. Nonces derive from the
 * ledger hash, so editing ANYTHING after freeze invalidates every signature.
 */
export async function signAllTransfers(people: Person[], frozen: FrozenLedgerState): Promise<SignedTransfer[]> {
  const byAddress = new Map(people.map((p) => [p.address.toLowerCase(), p]));
  const now = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = 0n;
  const validBefore = now + AUTH_VALIDITY_SECONDS;

  const out: SignedTransfer[] = [];
  for (let i = 0; i < frozen.transfers.length; i++) {
    const t = frozen.transfers[i]!;
    const person = byAddress.get(t.from.toLowerCase());
    if (!person?.demoPrivateKey) throw new Error(`No demo key for debtor ${t.from}`);
    const account = privateKeyToAccount(person.demoPrivateKey);

    const value = BigInt(t.value);
    const nonce = transferNonce(frozen.ledgerHash, t.from, t.to, value, i);
    const typed = buildTransferAuthorizationTypedData({
      from: t.from,
      to: t.to,
      value,
      validAfter,
      validBefore,
      nonce,
    });
    const signature = await account.signTypedData(typed);
    const { v, r, s } = parseSignature(signature);
    out.push({
      from: t.from,
      to: t.to,
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

export function shortHex(hex: string, chars = 6): string {
  return hex.length <= 2 + chars * 2 ? hex : `${hex.slice(0, 2 + chars)}…${hex.slice(-chars)}`;
}

export function formatUsdcMinor(minor: string): string {
  const v = BigInt(minor);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole}.${frac}`;
}
