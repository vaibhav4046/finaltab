import { describe, it, expect } from "vitest";
import { netPositions, nettedTransfers, type Debt } from "../src/netting.js";
import { sum } from "../src/money.js";

describe("netPositions", () => {
  it("nets opposing debts", () => {
    const debts: Debt[] = [
      { debtor: "alice", creditor: "bob", amount: 100n },
      { debtor: "bob", creditor: "alice", amount: 40n },
    ];
    expect(netPositions(debts)).toEqual([
      { participant: "alice", net: -60n },
      { participant: "bob", net: 60n },
    ]);
  });
  it("rejects self-debt and non-positive", () => {
    expect(() => netPositions([{ debtor: "a", creditor: "a", amount: 1n }])).toThrow();
    expect(() => netPositions([{ debtor: "a", creditor: "b", amount: 0n }])).toThrow();
  });
});

describe("nettedTransfers", () => {
  it("circular debt cancels to zero transfers", () => {
    const debts: Debt[] = [
      { debtor: "a", creditor: "b", amount: 10n },
      { debtor: "b", creditor: "c", amount: 10n },
      { debtor: "c", creditor: "a", amount: 10n },
    ];
    expect(nettedTransfers(debts)).toEqual([]);
  });
  it("chain collapses: a->b->c 10 becomes a->c 10", () => {
    const debts: Debt[] = [
      { debtor: "a", creditor: "b", amount: 10n },
      { debtor: "b", creditor: "c", amount: 10n },
    ];
    expect(nettedTransfers(debts)).toEqual([{ debtor: "a", creditor: "c", amount: 10n }]);
  });
  it("multi-receipt scenario reduces transfer count and conserves value", () => {
    // Dinner: alice paid, bob+carol owe 30 each. Taxi: bob paid, alice+carol owe 10 each.
    const debts: Debt[] = [
      { debtor: "bob", creditor: "alice", amount: 30n },
      { debtor: "carol", creditor: "alice", amount: 30n },
      { debtor: "alice", creditor: "bob", amount: 10n },
      { debtor: "carol", creditor: "bob", amount: 10n },
    ];
    const out = nettedTransfers(debts);
    // Net: alice +50, bob -20... check conservation not exact shape
    const positions = netPositions(debts);
    const positive = sum(positions.filter((p) => p.net > 0n).map((p) => p.net));
    expect(sum(out.map((t) => t.amount))).toBe(positive);
    expect(out.length).toBeLessThanOrEqual(positions.length - 1);
    // No transfer to self, all positive
    for (const t of out) {
      expect(t.debtor).not.toBe(t.creditor);
      expect(t.amount > 0n).toBe(true);
    }
  });
  it("deterministic across calls", () => {
    const debts: Debt[] = [
      { debtor: "d1", creditor: "c1", amount: 55n },
      { debtor: "d2", creditor: "c2", amount: 55n },
      { debtor: "d3", creditor: "c1", amount: 20n },
    ];
    expect(nettedTransfers(debts)).toEqual(nettedTransfers(debts));
  });
  it("at most n-1 transfers", () => {
    const debts: Debt[] = [
      { debtor: "a", creditor: "e", amount: 7n },
      { debtor: "b", creditor: "e", amount: 11n },
      { debtor: "c", creditor: "e", amount: 13n },
      { debtor: "d", creditor: "e", amount: 17n },
      { debtor: "e", creditor: "a", amount: 3n },
    ];
    const parties = new Set(debts.flatMap((d) => [d.debtor, d.creditor]));
    expect(nettedTransfers(debts).length).toBeLessThanOrEqual(parties.size - 1);
  });
});
