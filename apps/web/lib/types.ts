import type { ParsedReceipt, AllocationProposal, Debt } from "@finaltab/engine";
import type { Verdict } from "@finaltab/keeperhub";

export interface Person {
  id: string;
  name: string;
  address: `0x${string}`;
}

export interface ReceiptState {
  receipt: ParsedReceipt;
  attempts: number;
  /** Provider reported by the server extraction route; absent for manual imports. */
  provider?: string;
  arithmeticIssues: string[];
  imageDataUrl: string;
  /** Set only after a human confirms the editable extraction and arithmetic passes. */
  confirmedAt?: string;
}

/**
 * Server verdict on whether this ledger can legally reach the chain. Non-USD
 * receipts split fine but never settle — see the allocate route.
 */
export interface SettlementEligibility {
  eligible: boolean;
  currency: string;
  reason?: string;
}

export interface AllocationState {
  proposal: AllocationProposal;
  /** Exact bounded instruction that produced the proposal. */
  instruction: string;
  /** fiat minor units consumed per participant (payer included), sums to receipt total */
  shares: Array<{ id: string; fiatMinor: string }>;
  /** debts toward the payer in USDC minor units — empty when settlement is ineligible */
  debts: Array<{ debtor: string; creditor: string; usdcMinor: string }>;
  settlement: SettlementEligibility;
}

export type ExecutionStage =
  | "idle"
  | "frozen"
  | "signed"
  | "simulating"
  | "sim_failed"
  | "executing"
  | "pending"
  | "verified"
  | "failed"
  | "unproven"
  | "blocked";

export interface SignedTransfer {
  from: `0x${string}`;
  to: `0x${string}`;
  /** USDC minor units as decimal string */
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
  authV: number;
  authR: `0x${string}`;
  authS: `0x${string}`;
  consentV: number;
  consentR: `0x${string}`;
  consentS: `0x${string}`;
}

export interface FrozenLedgerState {
  canonicalJson: string;
  ledgerHash: `0x${string}`;
  settlementId: `0x${string}`;
  transfers: Array<{ from: `0x${string}`; to: `0x${string}`; value: string }>;
  /** V2 executes one aggregated pull per debtor, avoiding duplicate EIP-3009 nonces. */
  debits: Array<{ debtor: `0x${string}`; value: string }>;
  payouts: Array<{ creditor: `0x${string}`; value: string }>;
}

export interface ExecutionState {
  stage: ExecutionStage;
  executionId?: string;
  verdict?: Verdict;
  error?: string;
  simulation?: Record<string, unknown>;
  receipts?: Array<Record<string, unknown>>;
  lastStatus?: Record<string, unknown>;
}

export interface NettingView {
  raw: Array<{ debtor: string; creditor: string; usdcMinor: string }>;
  netted: Array<{ debtor: string; creditor: string; usdcMinor: string }>;
}

export function debtsToView(debts: readonly Debt[]): Array<{ debtor: string; creditor: string; usdcMinor: string }> {
  return debts.map((d) => ({ debtor: d.debtor, creditor: d.creditor, usdcMinor: d.amount.toString() }));
}
