import { parseFiat, sum, fiatMinorToUsdcMinor } from "./money.js";
import { largestRemainderSplit } from "./split.js";
import type { ParsedReceipt, AllocationProposal } from "./validation.js";
import type { Debt } from "./netting.js";

/**
 * Deterministic reconciliation. The AI proposes; this code decides.
 * Every check here is arithmetic on bigints — no model output is trusted.
 */

export interface ReconcileIssue {
  code:
    | "LINE_MATH_MISMATCH"
    | "SUBTOTAL_MISMATCH"
    | "TOTAL_MISMATCH"
    | "ITEM_INDEX_OUT_OF_RANGE"
    | "DUPLICATE_ITEM_ALLOCATION"
    | "UNALLOCATED_ITEMS"
    | "WEIGHTS_LENGTH_MISMATCH"
    | "PAYER_NOT_PARTICIPANT";
  message: string;
}

export interface ReconcileResult {
  ok: boolean;
  issues: ReconcileIssue[];
  /**
   * Per-participant fiat minor units consumed, for EVERY participant who
   * shares at least one item (payer included). Sums exactly to totalMinor.
   * sharesToDebts() is what drops the payer's own share. Only set when ok.
   */
  shares: Map<string, bigint> | null;
  /** total fiat minor units of the receipt */
  totalMinor: bigint;
}

/** Verify the receipt's internal arithmetic. Returns issues; empty = consistent. */
export function checkReceiptArithmetic(receipt: ParsedReceipt): ReconcileIssue[] {
  const issues: ReconcileIssue[] = [];
  for (let i = 0; i < receipt.items.length; i++) {
    const item = receipt.items[i]!;
    const unit = parseFiat(item.unitPrice);
    const line = parseFiat(item.lineTotal);
    if (unit * BigInt(item.quantity) !== line) {
      issues.push({
        code: "LINE_MATH_MISMATCH",
        message: `Item ${i} "${item.description}": ${item.quantity} x ${item.unitPrice} != ${item.lineTotal}`,
      });
    }
  }
  const lineSum = sum(receipt.items.map((it) => parseFiat(it.lineTotal)));
  if (receipt.subtotal !== null && parseFiat(receipt.subtotal) !== lineSum) {
    issues.push({
      code: "SUBTOTAL_MISMATCH",
      message: `Line items sum to ${lineSum} minor units but subtotal says ${parseFiat(receipt.subtotal)}`,
    });
  }
  const extras =
    (receipt.tax ? parseFiat(receipt.tax) : 0n) +
    (receipt.tip ? parseFiat(receipt.tip) : 0n) +
    (receipt.serviceCharge ? parseFiat(receipt.serviceCharge) : 0n);
  const expectedTotal = lineSum + extras;
  if (parseFiat(receipt.total) !== expectedTotal) {
    issues.push({
      code: "TOTAL_MISMATCH",
      message: `Items+extras = ${expectedTotal} minor units but total says ${parseFiat(receipt.total)}`,
    });
  }
  return issues;
}

/**
 * Apply an allocation proposal to a receipt. Extras (tax/tip/service) are
 * distributed proportionally to each participant's item share using
 * largest-remainder so the grand total is preserved to the cent.
 */
export function reconcileAllocation(receipt: ParsedReceipt, proposal: AllocationProposal): ReconcileResult {
  const issues = checkReceiptArithmetic(receipt);
  const totalMinor = parseFiat(receipt.total);

  const seen = new Set<number>();
  for (const a of proposal.allocations) {
    if (a.itemIndex >= receipt.items.length) {
      issues.push({ code: "ITEM_INDEX_OUT_OF_RANGE", message: `itemIndex ${a.itemIndex} out of range` });
      continue;
    }
    if (seen.has(a.itemIndex)) {
      issues.push({ code: "DUPLICATE_ITEM_ALLOCATION", message: `itemIndex ${a.itemIndex} allocated twice` });
    }
    seen.add(a.itemIndex);
    if (a.weights && a.weights.length !== a.participants.length) {
      issues.push({
        code: "WEIGHTS_LENGTH_MISMATCH",
        message: `itemIndex ${a.itemIndex}: ${a.weights.length} weights for ${a.participants.length} participants`,
      });
    }
  }
  const unallocated = receipt.items.map((_, i) => i).filter((i) => !seen.has(i));
  if (unallocated.length > 0) {
    issues.push({ code: "UNALLOCATED_ITEMS", message: `Items not allocated: ${unallocated.join(", ")}` });
  }

  const allParticipants = new Set<string>(proposal.allocations.flatMap((a) => a.participants));
  if (!allParticipants.has(proposal.payerId)) {
    // Payer not sharing any item is legal only if they explicitly consume nothing;
    // flag it so the UI confirms rather than silently accepting.
    issues.push({ code: "PAYER_NOT_PARTICIPANT", message: `Payer ${proposal.payerId} shares no items` });
  }

  if (issues.length > 0) return { ok: false, issues, shares: null, totalMinor };

  // Item shares per participant.
  const itemShare = new Map<string, bigint>();
  for (const a of proposal.allocations) {
    const item = receipt.items[a.itemIndex]!;
    const lineMinor = parseFiat(item.lineTotal);
    const weights = a.weights ? a.weights.map((w) => BigInt(w)) : a.participants.map(() => 1n);
    const parts = largestRemainderSplit(lineMinor, weights);
    a.participants.forEach((p, idx) => {
      itemShare.set(p, (itemShare.get(p) ?? 0n) + parts[idx]!);
    });
  }

  // Extras proportional to item share.
  const extrasMinor = totalMinor - sum([...itemShare.values()]);
  const participants = [...itemShare.keys()].sort();
  if (extrasMinor > 0n) {
    const weights = participants.map((p) => itemShare.get(p)!);
    const extraParts = largestRemainderSplit(extrasMinor, weights);
    participants.forEach((p, idx) => {
      itemShare.set(p, itemShare.get(p)! + extraParts[idx]!);
    });
  }

  // Conservation: shares must sum to receipt total exactly.
  if (sum([...itemShare.values()]) !== totalMinor) {
    throw new Error("reconcileAllocation: conservation invariant violated");
  }

  return { ok: true, issues: [], shares: itemShare, totalMinor };
}

/** Convert reconciled shares into debts toward the payer (fiat minor -> USDC minor 1:1 by value). */
export function sharesToDebts(shares: Map<string, bigint>, payerId: string): Debt[] {
  const debts: Debt[] = [];
  for (const [participant, fiatMinor] of [...shares.entries()].sort()) {
    if (participant === payerId || fiatMinor === 0n) continue;
    debts.push({ debtor: participant, creditor: payerId, amount: fiatMinorToUsdcMinor(fiatMinor) });
  }
  return debts;
}
