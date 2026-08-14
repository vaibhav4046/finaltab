import { describe, it, expect } from "vitest";
import { canonicalAmount, canonicalIdempotencyString, deriveIdempotencyKey } from "../src/idempotency.js";

describe("canonicalAmount", () => {
  it("strips leading/trailing zeros", () => {
    expect(canonicalAmount("010.500")).toBe("10.5");
    expect(canonicalAmount("0.10")).toBe("0.1");
    expect(canonicalAmount("100")).toBe("100");
  });
  it("empty -> 0, bare zero forms -> 0", () => {
    expect(canonicalAmount("")).toBe("0");
    expect(canonicalAmount("0")).toBe("0");
    expect(canonicalAmount("0.0")).toBe("0");
    expect(canonicalAmount("000")).toBe("0");
  });
  it("rejects exponent and garbage", () => {
    expect(() => canonicalAmount("1e5")).toThrow();
    expect(() => canonicalAmount("-1")).toThrow();
    expect(() => canonicalAmount("abc")).toThrow();
  });

  // Trailing zeros used to be stripped with `0+$`, which the engine retries
  // from every position inside a run of zeros. This function decides an
  // idempotency key, so the replacement has to remove exactly the same
  // characters as the expression it replaced, on every shape of input.
  it("matches the expression it replaced on every zero shape", () => {
    const shapes = [
      "0",
      "00",
      "0.0",
      "0.000",
      "10.500",
      "010.500",
      "1.000000000000000000",
      "0.000000000000000001",
      "100",
      "100.001",
      ".5",
      ".500",
      "1.",
      "000.000",
      "123456789.123456789",
    ];
    for (const shape of shapes) {
      const [, fracRaw = ""] = shape.split(".");
      let end = fracRaw.length;
      while (end > 0 && fracRaw[end - 1] === "0") end -= 1;
      expect(fracRaw.slice(0, end)).toBe(fracRaw.replace(/0+$/, ""));
    }
  });

  it("stays fast on a long run of trailing zeros", () => {
    const hostile = `1.${"0".repeat(200_000)}`;
    const start = Date.now();
    expect(canonicalAmount(hostile)).toBe("1");
    // The old expression needed roughly twelve seconds for this input.
    expect(Date.now() - start).toBeLessThan(1_000);
  });
});

describe("canonicalIdempotencyString", () => {
  it("joins with U+007C, lowercases addresses, decimal chainId", () => {
    const s = canonicalIdempotencyString({
      taskId: "settle-1",
      chainId: 84532,
      recipientAddress: "0xABCDEF0000000000000000000000000000000001",
      amount: "0.00",
      tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    });
    expect(s).toBe(
      "settle-1|84532|0xabcdef0000000000000000000000000000000001|0|0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    );
  });
  it("escapes % then | in taskId", () => {
    const s = canonicalIdempotencyString({
      taskId: " a%|b ",
      chainId: 1,
      recipientAddress: "0xABCDEF0000000000000000000000000000000001",
      amount: "1",
    });
    expect(s.startsWith("a%25%7Cb|1|")).toBe(true);
  });
  it("omitted optional fields = empty string", () => {
    const s = canonicalIdempotencyString({
      chainId: 84532,
      recipientAddress: "0xAAAA000000000000000000000000000000000001",
      amount: "5",
    });
    expect(s).toBe("|84532|0xaaaa000000000000000000000000000000000001|5|");
  });
});

describe("deriveIdempotencyKey", () => {
  it("is 64-char lowercase hex and stable", () => {
    const parts = {
      taskId: "t",
      chainId: 84532,
      recipientAddress: "0xAAAA000000000000000000000000000000000001",
      amount: "1.50",
    };
    const k1 = deriveIdempotencyKey(parts);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveIdempotencyKey(parts)).toBe(k1);
    // equivalent canonical amounts hash identically
    expect(deriveIdempotencyKey({ ...parts, amount: "01.5000" })).toBe(k1);
    // different amount hashes differently
    expect(deriveIdempotencyKey({ ...parts, amount: "1.51" })).not.toBe(k1);
  });
});
