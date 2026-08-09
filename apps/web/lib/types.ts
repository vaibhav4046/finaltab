import type { ParsedReceipt, AllocationProposal, Debt } from "@finaltab/engine";
import type { Verdict } from "@finaltab/keeperhub";

export interface Person {
  id: string;
  name: string;
  address: `0x${string}`;
  /** present only for local demo signers — never for real wallets */
  demoPrivateKey?: `0x${string}`;
}

export interface ReceiptState {
  receipt: ParsedReceipt;
  attempts: number;
  arithmeticIssues: string[];
  imageDataUrl: string;
}

export interface AllocationState {
  proposal: AllocationProposal;
  /** fiat minor units consumed per participant (payer included), sums to receipt total */
  shares: Array<{ id: string; fiatMinor: string }>;
  /** debts toward the payer in USDC minor units */
  debts: Array<{ debtor: string; creditor: string; usdcMinor: string }>;
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
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

export interface FrozenLedgerState {
  canonicalJson: string;
  ledgerHash: `0x${string}`;
  settlementId: `0x${string}`;
  transfers: Array<{ from: `0x${string}`; to: `0x${string}`; value: string }>;
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
