import { concat, encodeAbiParameters, keccak256, toHex } from "viem";
import { BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_USDC } from "./eip3009.js";

/**
 * V2 settlement-plan commitments.
 *
 * EIP-3009 only authorizes a pull into the settlement contract; it does not
 * name the ultimate creditors. V2 therefore gives every debtor a second,
 * contract-domain EIP-712 signature over `planHash`. The hash commits to the
 * complete debit and payout vectors, so a permissionless executor can submit
 * the plan but cannot redirect a cent.
 */

export const SETTLEMENT_PLAN_TYPE =
  "SettlementPlan(uint256 chainId,address settlementContract,address token,bytes32 ledgerHash,bytes32 debitsHash,bytes32 payoutsHash)";
export const SETTLEMENT_DEBIT_TYPE = "Debit(address debtor,uint256 value)";
export const SETTLEMENT_PAYOUT_TYPE = "Payout(address creditor,uint256 value)";

export const SETTLEMENT_PLAN_TYPEHASH = keccak256(toHex(SETTLEMENT_PLAN_TYPE));
export const SETTLEMENT_DEBIT_TYPEHASH = keccak256(toHex(SETTLEMENT_DEBIT_TYPE));
export const SETTLEMENT_PAYOUT_TYPEHASH = keccak256(toHex(SETTLEMENT_PAYOUT_TYPE));

export const FINAL_TAB_SETTLEMENT_DOMAIN = {
  name: "FINALTab Settlement",
  version: "2",
} as const;

export const SETTLEMENT_CONSENT_TYPES = {
  SettlementConsent: [
    { name: "planHash", type: "bytes32" },
    { name: "debtor", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
} as const;

export interface SettlementDebit {
  debtor: `0x${string}`;
  value: bigint;
}

export interface SettlementPayout {
  creditor: `0x${string}`;
  value: bigint;
}

export interface SettlementPlanInput {
  ledgerHash: `0x${string}`;
  settlementContract: `0x${string}`;
  debits: readonly SettlementDebit[];
  payouts: readonly SettlementPayout[];
  chainId?: number;
  token?: `0x${string}`;
}

export interface SettlementConsent {
  planHash: `0x${string}`;
  debtor: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
}

function lower(address: `0x${string}`): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`Invalid address: ${address}`);
  return address.toLowerCase() as `0x${string}`;
}

function hashVector(hashes: readonly `0x${string}`[]): `0x${string}` {
  return keccak256(hashes.length === 0 ? "0x" : concat([...hashes]));
}

/** Aggregate an arbitrary netted graph into one debit per debtor and one payout per creditor. */
export function aggregateSettlementTransfers(
  transfers: readonly { from: `0x${string}`; to: `0x${string}`; value: bigint }[],
): { debits: SettlementDebit[]; payouts: SettlementPayout[] } {
  const debitByAddress = new Map<`0x${string}`, bigint>();
  const payoutByAddress = new Map<`0x${string}`, bigint>();

  for (const transfer of transfers) {
    if (transfer.value <= 0n) throw new Error("Settlement transfer value must be positive");
    const from = lower(transfer.from);
    const to = lower(transfer.to);
    if (from === to) throw new Error("Settlement transfer cannot pay itself");
    debitByAddress.set(from, (debitByAddress.get(from) ?? 0n) + transfer.value);
    payoutByAddress.set(to, (payoutByAddress.get(to) ?? 0n) + transfer.value);
  }

  const debits = [...debitByAddress.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([debtor, value]) => ({ debtor, value }));
  const payouts = [...payoutByAddress.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([creditor, value]) => ({ creditor, value }));

  return { debits, payouts };
}

export function settlementDebitsHash(debits: readonly SettlementDebit[]): `0x${string}` {
  return hashVector(
    debits.map((debit) => {
      if (debit.value <= 0n) throw new Error("Settlement debit value must be positive");
      return keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
          [SETTLEMENT_DEBIT_TYPEHASH, lower(debit.debtor), debit.value],
        ),
      );
    }),
  );
}

export function settlementPayoutsHash(payouts: readonly SettlementPayout[]): `0x${string}` {
  return hashVector(
    payouts.map((payout) => {
      if (payout.value <= 0n) throw new Error("Settlement payout value must be positive");
      return keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
          [SETTLEMENT_PAYOUT_TYPEHASH, lower(payout.creditor), payout.value],
        ),
      );
    }),
  );
}

/** Exact V2 plan hash mirrored by FinalTabBatchSettlementV2.computePlanHash. */
export function hashSettlementPlan(input: SettlementPlanInput): `0x${string}` {
  const chainId = input.chainId ?? BASE_SEPOLIA_CHAIN_ID;
  const token = input.token ?? BASE_SEPOLIA_USDC;
  return keccak256(
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
      [
        SETTLEMENT_PLAN_TYPEHASH,
        BigInt(chainId),
        lower(input.settlementContract),
        lower(token),
        input.ledgerHash,
        settlementDebitsHash(input.debits),
        settlementPayoutsHash(input.payouts),
      ],
    ),
  );
}

/** The USDC nonce is checked by V2, so it is cryptographically tied to the complete plan. */
export function settlementAuthorizationNonce(
  planHash: `0x${string}`,
  debtor: `0x${string}`,
  value: bigint,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [planHash, lower(debtor), value],
    ),
  );
}

export function buildSettlementConsentTypedData(
  settlementContract: `0x${string}`,
  consent: SettlementConsent,
) {
  return {
    domain: {
      ...FINAL_TAB_SETTLEMENT_DOMAIN,
      chainId: BASE_SEPOLIA_CHAIN_ID,
      verifyingContract: lower(settlementContract),
    },
    types: SETTLEMENT_CONSENT_TYPES,
    primaryType: "SettlementConsent" as const,
    message: {
      ...consent,
      debtor: lower(consent.debtor),
    },
  };
}
