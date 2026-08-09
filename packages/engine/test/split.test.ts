import { describe, it, expect } from "vitest";
import { largestRemainderSplit, equalSplit } from "../src/split.js";
import { sum } from "../src/money.js";

describe("largestRemainderSplit", () => {
  it("splits 100 across 3 equally: 34/33/33", () => {
    expect(equalSplit(100n, 3)).toEqual([34n, 33n, 33n]);
  });
  it("splits 10.00 across 3: sum exact, first gets extra cent", () => {
    const parts = equalSplit(1000n, 3);
    expect(sum(parts)).toBe(1000n);
    expect(parts).toEqual([334n, 333n, 333n]);
  });
  it("respects weights", () => {
    // 2:1:1 on 100 -> 50/25/25
    expect(largestRemainderSplit(100n, [2n, 1n, 1n])).toEqual([50n, 25n, 25n]);
  });
  it("weighted with remainder still sums exactly", () => {
    const parts = largestRemainderSplit(101n, [3n, 2n, 2n]);
    expect(sum(parts)).toBe(101n);
  });
  it("deterministic: same inputs same outputs", () => {
    const a = largestRemainderSplit(997n, [1n, 1n, 1n, 1n, 1n, 1n, 1n]);
    const b = largestRemainderSplit(997n, [1n, 1n, 1n, 1n, 1n, 1n, 1n]);
    expect(a).toEqual(b);
    expect(sum(a)).toBe(997n);
  });
  it("zero total gives zeros", () => {
    expect(equalSplit(0n, 4)).toEqual([0n, 0n, 0n, 0n]);
  });
  it("zero-weight participant gets nothing", () => {
    expect(largestRemainderSplit(100n, [1n, 0n, 1n])).toEqual([50n, 0n, 50n]);
  });
  it("rejects invalid inputs", () => {
    expect(() => largestRemainderSplit(100n, [])).toThrow();
    expect(() => largestRemainderSplit(-1n, [1n])).toThrow();
    expect(() => largestRemainderSplit(100n, [-1n, 2n])).toThrow();
    expect(() => largestRemainderSplit(100n, [0n, 0n])).toThrow();
  });
  it("fuzz: 500 random cases conserve total", () => {
    let seed = 42;
    const rnd = () => {
      // deterministic LCG so failures reproduce
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let i = 0; i < 500; i++) {
      const n = (rnd() % 8) + 1;
      const total = BigInt(rnd() % 1000000);
      const weights = Array.from({ length: n }, () => BigInt((rnd() % 9) + 1));
      const parts = largestRemainderSplit(total, weights);
      expect(sum(parts)).toBe(total);
      expect(parts.every((p) => p >= 0n)).toBe(true);
    }
  });
});
