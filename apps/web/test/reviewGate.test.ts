import { afterEach, describe, expect, it } from "vitest";
import {
  freezeReviewedLedger,
  invalidateReviewedSettlement,
  reviewedSettlementInputKey,
  type ReviewedSettlementBinding,
} from "@/lib/reviewGate";
import type { Person } from "@/lib/types";

const RECEIPT_ID = "00000000-0000-4000-8000-000000000501";
const CONTRACT = "0x1111111111111111111111111111111111111111";
const priorContract = process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT;

const people: Person[] = [
  { id: "participant-a", name: "Participant A", address: "0x2222222222222222222222222222222222222222" },
  { id: "participant-b", name: "Participant B", address: "0x3333333333333333333333333333333333333333" },
];
const debts = [{ debtor: "participant-b", creditor: "participant-a", usdcMinor: "1250000" }];
const INPUT_KEY = reviewedSettlementInputKey({
  tabId: "00000000-0000-4000-8000-000000000100",
  people,
  receipt: null,
  payerParticipantId: "participant-a",
  allocation: null,
  netted: debts,
  currency: "USD",
});
const review = (): ReviewedSettlementBinding => ({
  runId: "00000000-0000-4000-8000-000000000401",
  status: "ready",
  durableReceiptId: RECEIPT_ID,
  allocationId: "00000000-0000-4000-8000-000000000601",
  inputHash: "a".repeat(64),
  inputKey: INPUT_KEY,
});

afterEach(() => {
  if (priorContract === undefined) delete process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT;
  else process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = priorContract;
});

describe("mandatory attested review before ledger freeze", () => {
  it("does not freeze without a review", () => {
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = CONTRACT;
    expect(() => freezeReviewedLedger(people, debts, null, "USD", INPUT_KEY)).toThrow(/attested four-stage review/);
  });

  it("does not freeze after an input edit invalidates a prior review", () => {
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = CONTRACT;
    let currentReview: ReviewedSettlementBinding | null = review();
    currentReview = invalidateReviewedSettlement();
    expect(() => freezeReviewedLedger(people, debts, currentReview, "USD", INPUT_KEY)).toThrow(/attested four-stage review/);
  });

  it("puts the exact durable receipt UUID into the frozen canonical ledger", () => {
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = CONTRACT;
    const frozen = freezeReviewedLedger(
      people,
      debts,
      review(),
      "USD",
      INPUT_KEY,
    );
    expect(JSON.parse(frozen.canonicalJson)).toMatchObject({ receiptIds: [RECEIPT_ID] });
  });

  it("rejects a synthetic or malformed receipt reference even with a ready label", () => {
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = CONTRACT;
    expect(() => freezeReviewedLedger(
      people,
      debts,
      { ...review(), durableReceiptId: "receipt-browser-slug" },
      "USD",
      INPUT_KEY,
    )).toThrow(/attested four-stage review/);
  });

  it("rejects a valid old review after any reviewed input changes", () => {
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = CONTRACT;
    expect(() => freezeReviewedLedger(
      people,
      debts,
      review(),
      "USD",
      `${INPUT_KEY}-changed`,
    )).toThrow(/attested four-stage review/);
  });
});
