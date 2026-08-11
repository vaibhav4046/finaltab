import { freezeLedger } from "./flow";
import type { AllocationState, FrozenLedgerState, Person, ReceiptState } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReviewedSettlementBinding {
  runId: string;
  durableReceiptId: string;
  allocationId: string;
  inputHash: string;
  inputKey: string;
  status: "ready" | "verified";
}

export interface ReviewedSettlementInput {
  tabId: string | null;
  people: readonly Person[];
  receipt: ReceiptState | null;
  payerParticipantId: string;
  allocation: AllocationState | null;
  netted: ReadonlyArray<{ debtor: string; creditor: string; usdcMinor: string }>;
  currency: string;
}

/**
 * Exact client-side snapshot guard for the first-party review flow. This is not
 * an authorization signature; it prevents a slow review response from being
 * applied to inputs that changed while the request was in flight.
 */
export function reviewedSettlementInputKey(input: ReviewedSettlementInput): string {
  return JSON.stringify({
    version: 1,
    tabId: input.tabId,
    participants: input.people.map((person) => ({
      id: person.id,
      name: person.name,
      address: person.address.toLowerCase(),
    })),
    receipt: input.receipt
      ? {
          value: input.receipt.receipt,
          confirmedAt: input.receipt.confirmedAt ?? null,
          provider: input.receipt.provider ?? null,
          attempts: input.receipt.attempts,
        }
      : null,
    payerParticipantId: input.payerParticipantId,
    allocation: input.allocation,
    netted: input.netted,
    currency: input.currency,
  });
}

export function reviewedReceiptId(
  review: ReviewedSettlementBinding | null,
  expectedInputKey: string,
): string | null {
  if (!review || (review.status !== "ready" && review.status !== "verified")) return null;
  if (
    !UUID_RE.test(review.runId) ||
    !UUID_RE.test(review.durableReceiptId) ||
    !UUID_RE.test(review.allocationId) ||
    !/^[0-9a-f]{64}$/.test(review.inputHash) ||
    review.inputKey !== expectedInputKey
  ) return null;
  return review.durableReceiptId;
}

export function invalidateReviewedSettlement(): null {
  return null;
}

export function freezeReviewedLedger(
  people: Person[],
  debts: Array<{ debtor: string; creditor: string; usdcMinor: string }>,
  review: ReviewedSettlementBinding | null,
  currency: string,
  expectedInputKey: string,
): FrozenLedgerState {
  const receiptId = reviewedReceiptId(review, expectedInputKey);
  if (!receiptId) throw new Error("Complete the attested four-stage review before freezing the settlement plan.");
  return freezeLedger(people, debts, receiptId, currency);
}
