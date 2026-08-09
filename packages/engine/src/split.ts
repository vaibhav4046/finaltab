import { sum } from "./money.js";

/**
 * Largest-remainder allocation: distribute `total` minor units across weights
 * so the parts are proportional, every part is an integer, and the parts sum
 * to exactly `total`. Deterministic: ties broken by lowest index.
 */
export function largestRemainderSplit(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) throw new Error("largestRemainderSplit: no weights");
  if (total < 0n) throw new Error("largestRemainderSplit: negative total");
  if (weights.some((w) => w < 0n)) throw new Error("largestRemainderSplit: negative weight");
  const weightSum = sum(weights);
  if (weightSum === 0n) throw new Error("largestRemainderSplit: zero weight sum");

  const floors = weights.map((w) => (total * w) / weightSum);
  const remainders = weights.map((w, i) => ({ i, rem: (total * w) % weightSum }));
  let leftover = total - sum(floors);

  // Highest remainder first; ties go to the lowest index for determinism.
  remainders.sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));

  const out = floors.slice();
  for (const { i } of remainders) {
    if (leftover === 0n) break;
    out[i] = out[i]! + 1n;
    leftover -= 1n;
  }
  if (sum(out) !== total) throw new Error("largestRemainderSplit: invariant violated");
  return out;
}

/** Equal split across n participants — weights of 1. */
export function equalSplit(total: bigint, n: number): bigint[] {
  return largestRemainderSplit(total, Array.from({ length: n }, () => 1n));
}
