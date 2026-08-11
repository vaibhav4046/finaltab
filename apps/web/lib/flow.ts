"use client";

import { privateKeyToAccount } from "viem/accounts";
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
import type { Person, FrozenLedgerState, SignedTransfer } from "./types";
import { resolveDemoKeys } from "./demoKeys";
import {
  connectWallet,
  getConnectedAccounts,
  signEIP712,
  switchToBaseSepolia,
} from "./wallet";

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
    transfers: canonical.transfers.map((t) => ({ from: t.from, to: t.to, value: t.value.toString() })),
    debits: debits.map((d) => ({ debtor: d.debtor, value: d.value.toString() })),
    payouts: payouts.map((p) => ({ creditor: p.creditor, value: p.value.toString() })),
  };
}

/**
 * Sign one aggregated pull per debtor. Each debtor signs both USDC's
 * ReceiveWithAuthorization and FINALTab's complete V2 payout plan.
 */
export async function signAllTransfers(people: Person[], frozen: FrozenLedgerState): Promise<SignedTransfer[]> {
  const out: SignedTransfer[] = [];
  for (let index = 0; index < frozen.debits.length; index++) {
    out.push(await signPreparedDebit(people, frozen, index));
  }
  return out;
}

/**
 * Collect one V2 debtor approval. Demo identities sign locally; live identities
 * must expose the exact participant wallet through the injected provider.
 * Returning one debit at a time makes account switching and remote approval
 * state explicit instead of pretending one click represented three people.
 */
export async function signPreparedDebit(
  people: Person[],
  frozen: FrozenLedgerState,
  debitIndex: number,
): Promise<SignedTransfer> {
  const byAddress = new Map(people.map((p) => [p.address.toLowerCase(), p]));
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
  const authorization = {
    from: debit.debtor,
    to: settlementContract,
    value,
    validAfter,
    validBefore,
    nonce,
  } as const;
  const consent = {
    planHash: frozen.settlementId,
    debtor: debit.debtor,
    value,
    validAfter,
    validBefore,
  } as const;
  const authTyped = buildReceiveAuthorizationTypedData(authorization);
  const consentTyped = buildSettlementConsentTypedData(settlementContract, consent);

  let authHex: `0x${string}`;
  let consentHex: `0x${string}`;
  if (person.demoPrivateKey) {
    const account = privateKeyToAccount(person.demoPrivateKey);
    authHex = await account.signTypedData(authTyped);
    consentHex = await account.signTypedData(consentTyped);
  } else {
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
    const signedConsent = await signEIP712(
      debit.debtor,
      consentTyped.domain,
      consentTyped.types,
      consentTyped.message,
      consentTyped.primaryType,
    );
    if (!signedConsent) throw new Error(`${person.name} cancelled the payout-plan consent.`);
    authHex = auth as `0x${string}`;
    consentHex = signedConsent as `0x${string}`;
  }

  const authSignature = parseSignature(authHex);
  const consentSignature = parseSignature(consentHex);
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
