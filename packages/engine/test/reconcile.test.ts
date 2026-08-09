import { describe, it, expect } from "vitest";
import { checkReceiptArithmetic, reconcileAllocation, sharesToDebts } from "../src/reconcile.js";
import { ParsedReceiptSchema, AllocationProposalSchema, type ParsedReceipt } from "../src/validation.js";
import { sum, parseFiat } from "../src/money.js";

function receipt(): ParsedReceipt {
  return ParsedReceiptSchema.parse({
    merchant: "Dishoom",
    date: "2026-08-08",
    currency: "GBP",
    items: [
      { description: "House black daal", quantity: 2, unitPrice: "7.50", lineTotal: "15.00" },
      { description: "Chicken ruby", quantity: 1, unitPrice: "13.20", lineTotal: "13.20" },
      { description: "Garlic naan", quantity: 3, unitPrice: "4.10", lineTotal: "12.30" },
    ],
    subtotal: "40.50",
    tax: null,
    tip: "4.05",
    serviceCharge: null,
    total: "44.55",
    confidence: 0.95,
  });
}

describe("checkReceiptArithmetic", () => {
  it("passes consistent receipt", () => {
    expect(checkReceiptArithmetic(receipt())).toEqual([]);
  });
  it("catches line math lies", () => {
    const r = receipt();
    r.items[0]!.lineTotal = "15.01";
    const issues = checkReceiptArithmetic(r);
    expect(issues.some((i) => i.code === "LINE_MATH_MISMATCH")).toBe(true);
  });
  it("catches total mismatch", () => {
    const r = receipt();
    r.total = "44.56";
    expect(checkReceiptArithmetic(r).some((i) => i.code === "TOTAL_MISMATCH")).toBe(true);
  });
});

describe("reconcileAllocation", () => {
  const proposal = AllocationProposalSchema.parse({
    allocations: [
      { itemIndex: 0, participants: ["alice", "bob", "carol"] },
      { itemIndex: 1, participants: ["bob"] },
      { itemIndex: 2, participants: ["alice", "carol"] },
    ],
    payerId: "alice",
  });

  it("shares sum to receipt total exactly (tip distributed)", () => {
    const res = reconcileAllocation(receipt(), proposal);
    expect(res.ok).toBe(true);
    expect(sum([...res.shares!.values()])).toBe(parseFiat("44.55"));
  });

  it("rejects out-of-range item index", () => {
    const bad = { ...proposal, allocations: [...proposal.allocations, { itemIndex: 9, participants: ["bob"] }] };
    const res = reconcileAllocation(receipt(), bad);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "ITEM_INDEX_OUT_OF_RANGE")).toBe(true);
  });

  it("rejects unallocated items", () => {
    const bad = { ...proposal, allocations: proposal.allocations.slice(0, 2) };
    const res = reconcileAllocation(receipt(), bad);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "UNALLOCATED_ITEMS")).toBe(true);
  });

  it("rejects duplicate allocation of same item", () => {
    const bad = { ...proposal, allocations: [...proposal.allocations, { itemIndex: 0, participants: ["bob"] }] };
    const res = reconcileAllocation(receipt(), bad);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "DUPLICATE_ITEM_ALLOCATION")).toBe(true);
  });

  it("flags payer sharing nothing", () => {
    const bad = AllocationProposalSchema.parse({
      allocations: [
        { itemIndex: 0, participants: ["bob", "carol"] },
        { itemIndex: 1, participants: ["bob"] },
        { itemIndex: 2, participants: ["carol"] },
      ],
      payerId: "alice",
    });
    const res = reconcileAllocation(receipt(), bad);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "PAYER_NOT_PARTICIPANT")).toBe(true);
  });

  it("weighted allocation conserves total", () => {
    const weighted = AllocationProposalSchema.parse({
      allocations: [
        { itemIndex: 0, participants: ["alice", "bob"], weights: [2, 1] },
        { itemIndex: 1, participants: ["bob"] },
        { itemIndex: 2, participants: ["alice", "carol"], weights: [1, 3] },
      ],
      payerId: "alice",
    });
    const res = reconcileAllocation(receipt(), weighted);
    expect(res.ok).toBe(true);
    expect(sum([...res.shares!.values()])).toBe(parseFiat("44.55"));
  });
});

describe("sharesToDebts", () => {
  it("excludes payer, converts to USDC minor", () => {
    const res = reconcileAllocation(receipt(), AllocationProposalSchema.parse({
      allocations: [
        { itemIndex: 0, participants: ["alice", "bob", "carol"] },
        { itemIndex: 1, participants: ["bob"] },
        { itemIndex: 2, participants: ["alice", "carol"] },
      ],
      payerId: "alice",
    }));
    const debts = sharesToDebts(res.shares!, "alice");
    expect(debts.every((d) => d.creditor === "alice" && d.debtor !== "alice")).toBe(true);
    // total debt = total minus alice's own share, scaled 10^4
    const aliceShare = res.shares!.get("alice")!;
    expect(sum(debts.map((d) => d.amount))).toBe((parseFiat("44.55") - aliceShare) * 10000n);
  });
});
