import { sum } from "./money.js";

export interface Debt {
  /** participant id (stable, lowercase) */
  debtor: string;
  creditor: string;
  /** USDC minor units, > 0 */
  amount: bigint;
}

export interface NetPosition {
  participant: string;
  /** positive = is owed money, negative = owes money */
  net: bigint;
}

/** Collapse raw pairwise debts into per-participant net positions. Deterministic order: participant id asc. */
export function netPositions(debts: readonly Debt[]): NetPosition[] {
  const net = new Map<string, bigint>();
  for (const d of debts) {
    if (d.amount <= 0n) throw new Error(`netPositions: non-positive debt ${d.debtor}->${d.creditor}`);
    if (d.debtor === d.creditor) throw new Error(`netPositions: self-debt for ${d.debtor}`);
    net.set(d.debtor, (net.get(d.debtor) ?? 0n) - d.amount);
    net.set(d.creditor, (net.get(d.creditor) ?? 0n) + d.amount);
  }
  return [...net.entries()]
    .map(([participant, n]) => ({ participant, net: n }))
    .sort((a, b) => (a.participant < b.participant ? -1 : a.participant > b.participant ? 1 : 0));
}

/**
 * Greedy netting: repeatedly match the largest debtor with the largest creditor.
 * Deterministic: ties broken by participant id (ascending). Produces at most n-1 transfers.
 * Conservation invariant checked: sum of outputs equals sum of positive nets.
 */
export function nettedTransfers(debts: readonly Debt[]): Debt[] {
  const positions = netPositions(debts);
  const debtors = positions.filter((p) => p.net < 0n).map((p) => ({ id: p.participant, owes: -p.net }));
  const creditors = positions.filter((p) => p.net > 0n).map((p) => ({ id: p.participant, due: p.net }));

  const totalOwed = sum(debtors.map((d) => d.owes));
  const totalDue = sum(creditors.map((c) => c.due));
  if (totalOwed !== totalDue) throw new Error("nettedTransfers: conservation violated in inputs");

  const out: Debt[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    // Largest first; ties by id ascending for determinism.
    debtors.sort((a, b) => (a.owes === b.owes ? (a.id < b.id ? -1 : 1) : a.owes > b.owes ? -1 : 1));
    creditors.sort((a, b) => (a.due === b.due ? (a.id < b.id ? -1 : 1) : a.due > b.due ? -1 : 1));
    const d = debtors[0]!;
    const c = creditors[0]!;
    const amt = d.owes < c.due ? d.owes : c.due;
    out.push({ debtor: d.id, creditor: c.id, amount: amt });
    d.owes -= amt;
    c.due -= amt;
    if (d.owes === 0n) debtors.shift();
    if (c.due === 0n) creditors.splice(creditors.indexOf(c), 1);
  }
  if (debtors.length > 0 || creditors.length > 0) {
    throw new Error("nettedTransfers: unmatched balance remained");
  }
  if (sum(out.map((t) => t.amount)) !== totalDue) {
    throw new Error("nettedTransfers: output conservation violated");
  }
  return out;
}
