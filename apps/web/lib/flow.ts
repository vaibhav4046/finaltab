"use client";

import { parseSignature } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  buildReceiveAuthorizationTypedData,
  buildSettlementConsentTypedData,
  aggregateSettlementTransfers,
  hashSettlementPlan,
  settlementAuthorizationNonce,
  canonicalizeLedger,
  ledgerToCanonicalJson,
  ledgerHash as computeLedgerHash,
  assertSettlementCurrency,
  type CanonicalLedger,
} from "@finaltab/engine";
import type { FrozenLedgerState, Person, SignedTransfer } from "./types";
import {
  connectWallet,
  getConnectedAccounts,
  signEIP712,
  switchToBaseSepolia,
} from "./wallet";

const AUTH_VALIDITY_SECONDS = 3600n;

/**
 * Freeze is the last point before money becomes signable, so the currency
 * check lives here as well as on the server. A non-USD ledger must never
 * acquire a ledgerHash because a hashed ledger is executable.
 */
export function freezeLedger(
  people: Person[],
  debts: Array<{ debtor: string; creditor: string; usdcMinor: string }>,
  receiptId: string,
  currency: string,
): FrozenLedgerState {
  assertSettlementCurrency(currency);
  const byId = new Map(people.map((person) => [person.id, person]));
  const transfers = debts.map((debt) => {
    const from = byId.get(debt.debtor);
    const to = byId.get(debt.creditor);
    if (!from || !to) throw new Error(`Unknown participant in debt: ${debt.debtor} -> ${debt.creditor}`);
    return { from: from.address, to: to.address, value: BigInt(debt.usdcMinor) };
  });

  const ledger: CanonicalLedger = {
    version: 1,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    participants: people.map((person) => ({
      id: person.id,
      address: person.address,
      displayName: person.name,
    })),
    transfers,
    receiptIds: [receiptId],
  };

  const canonical = canonicalizeLedger(ledger);
  const hash = computeLedgerHash(canonical);
  const settlementContract = (process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT || "") as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(settlementContract)) {
    throw new Error("NEXT_PUBLIC_SETTLEMENT_CONTRACT not configured for V2");
  }
  const { debits, payouts } = aggregateSettlementTransfers(canonical.transfers);
  const planHash = hashSettlementPlan({
    ledgerHash: hash,
    settlementContract,
    debits,
    payouts,
  });
  return {
    canonicalJson: ledgerToCanonicalJson(canonical),
    ledgerHash: hash,
    settlementId: planHash,
    transfers: canonical.transfers.map((transfer) => ({
      from: transfer.from,
      to: transfer.to,
      value: transfer.value.toString(),
    })),
    debits: debits.map((debit) => ({ debtor: debit.debtor, value: debit.value.toString() })),
    payouts: payouts.map((payout) => ({ creditor: payout.creditor, value: payout.value.toString() })),
  };
}

/**
 * Collect one V2 debtor approval from the exact participant wallet exposed by
 * the injected provider. One debit at a time keeps account switching and
 * remote approval state explicit.
 */
export async function signPreparedDebit(
  people: Person[],
  frozen: FrozenLedgerState,
  debitIndex: number,
): Promise<SignedTransfer> {
  const byAddress = new Map(people.map((person) => [person.address.toLowerCase(), person]));
  const settlementContract = (process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT || "") as `0x${string}`;
  if (!settlementContract) throw new Error("NEXT_PUBLIC_SETTLEMENT_CONTRACT not configured");

  const now = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = 0n;
  const validBefore = now + AUTH_VALIDITY_SECONDS;

  const debit = frozen.debits[debitIndex];
  if (!debit) throw new Error(`Unknown debit ${debitIndex}`);
  const person = byAddress.get(debit.debtor.toLowerCase());
  if (!person) throw new Error(`No participant for debtor ${debit.debtor}`);

  const value = BigInt(debit.value);
  const nonce = settlementAuthorizationNonce(frozen.settlementId, debit.debtor, value);
  const authTyped = buildReceiveAuthorizationTypedData({
    from: debit.debtor,
    to: settlementContract,
    value,
    validAfter,
    validBefore,
    nonce,
  });
  const consentTyped = buildSettlementConsentTypedData(settlementContract, {
    planHash: frozen.settlementId,
    debtor: debit.debtor,
    value,
    validAfter,
    validBefore,
  });

  let connected = await getConnectedAccounts();
  if (connected.length === 0) {
    const account = await connectWallet();
    connected = account ? [account.address] : [];
  }
  if (!connected.some((address) => address.toLowerCase() === debit.debtor.toLowerCase())) {
    throw new Error(`Connect ${person.name}'s wallet (${debit.debtor}) to approve this debit.`);
  }
  if (!(await switchToBaseSepolia())) throw new Error("Switch the wallet to Base Sepolia.");

  const auth = await signEIP712(
    debit.debtor,
    authTyped.domain,
    authTyped.types,
    authTyped.message,
    authTyped.primaryType,
  );
  if (!auth) throw new Error(`${person.name} cancelled the USDC authorization.`);
  const consent = await signEIP712(
    debit.debtor,
    consentTyped.domain,
    consentTyped.types,
    consentTyped.message,
    consentTyped.primaryType,
  );
  if (!consent) throw new Error(`${person.name} cancelled the payout-plan consent.`);

  const authSignature = parseSignature(auth as `0x${string}`);
  const consentSignature = parseSignature(consent as `0x${string}`);
  return {
    from: debit.debtor,
    to: settlementContract,
    value: debit.value,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    authV: Number(authSignature.v ?? 27n),
    authR: authSignature.r,
    authS: authSignature.s,
    consentV: Number(consentSignature.v ?? 27n),
    consentR: consentSignature.r,
    consentS: consentSignature.s,
  };
}

/** Derive the deterministic aggregate creditor payouts from frozen transfers. */
export function derivePayouts(
  transfers: ReadonlyArray<{ to: string; value: string }>,
): Array<{ creditor: string; value: string }> {
  const byCreditor = new Map<string, bigint>();
  for (const transfer of transfers) {
    byCreditor.set(transfer.to, (byCreditor.get(transfer.to) ?? 0n) + BigInt(transfer.value));
  }
  return [...byCreditor.entries()]
    .sort(([left], [right]) => (left.toLowerCase() < right.toLowerCase() ? -1 : 1))
    .map(([creditor, value]) => ({ creditor, value: value.toString() }));
}

export function shortHex(hex: string, chars = 6): string {
  return hex.length <= 2 + chars * 2 ? hex : `${hex.slice(0, 2 + chars)}…${hex.slice(-chars)}`;
}

export function formatUsdcMinor(minor: string): string {
  const value = BigInt(minor);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole}.${fraction}`;
}
