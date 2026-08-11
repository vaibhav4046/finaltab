import { describe, it, expect } from "vitest";
import {
  formatAmount,
  parseFiat,
  formatFiat,
  parseUsdc,
  fiatMinorToUsdcMinor,
  isSettlementCurrency,
  assertSettlementCurrency,
  SETTLEMENT_CURRENCY,
  sum,
} from "../src/money.js";

describe("parseAmount", () => {
  it("parses whole and fractional fiat", () => {
    expect(parseFiat("12.34")).toBe(1234n);
    expect(parseFiat("0.01")).toBe(1n);
    expect(parseFiat("100")).toBe(10000n);
    expect(parseFiat("0")).toBe(0n);
  });
  it("parses single-digit fraction as tenths", () => {
    expect(parseFiat("12.3")).toBe(1230n);
  });
  it("parses USDC 6dp", () => {
    expect(parseUsdc("1.000001")).toBe(1000001n);
    expect(parseUsdc("0.000001")).toBe(1n);
  });
  it("rejects negatives, exponents, garbage", () => {
    expect(() => parseFiat("-1.00")).toThrow();
    expect(() => parseFiat("1e5")).toThrow();
    expect(() => parseFiat("12.345")).toThrow(); // 3dp in fiat
    expect(() => parseFiat("abc")).toThrow();
    expect(() => parseFiat("1.2.3")).toThrow();
    expect(() => parseFiat("")).toThrow();
    expect(() => parseFiat(".5")).toThrow();
  });
});

describe("formatAmount", () => {
  it("round-trips", () => {
    expect(formatFiat(1234n)).toBe("12.34");
    expect(formatFiat(1n)).toBe("0.01");
    expect(formatFiat(0n)).toBe("0.00");
    expect(formatAmount(1000001n, 6)).toBe("1.000001");
  });
  it("rejects negative", () => {
    expect(() => formatFiat(-1n)).toThrow();
  });
});

describe("fiatMinorToUsdcMinor", () => {
  it("scales 2dp to 6dp exactly", () => {
    expect(fiatMinorToUsdcMinor(1234n)).toBe(12340000n); // 12.34 -> 12.340000
    expect(fiatMinorToUsdcMinor(1n)).toBe(10000n); // 0.01 -> 0.010000
  });
});

describe("settlement currency guard", () => {
  it("accepts USD in any casing or padding", () => {
    expect(SETTLEMENT_CURRENCY).toBe("USD");
    expect(isSettlementCurrency("USD")).toBe(true);
    expect(isSettlementCurrency("usd")).toBe(true);
    expect(isSettlementCurrency(" USD ")).toBe(true);
    expect(() => assertSettlementCurrency("USD")).not.toThrow();
  });

  // USDC is USD-denominated. Rescaling GBP 12.50 into 12_500_000 USDC minor
  // units is arithmetically clean and financially wrong — it applies an
  // unquoted FX rate of 1.0 and moves the wrong amount of real value.
  it("refuses every non-USD ledger currency", () => {
    for (const c of ["GBP", "EUR", "INR", "JPY", "CAD", "AUD", "USDT", ""]) {
      expect(isSettlementCurrency(c)).toBe(false);
      expect(() => assertSettlementCurrency(c)).toThrow(/exchange rate/);
    }
  });

  it("names the offending currency in the error so the UI can quote it", () => {
    expect(() => assertSettlementCurrency("GBP")).toThrow(/GBP/);
  });

  it("the rescale itself is currency-blind — the guard is the only defence", () => {
    // fiatMinorToUsdcMinor takes no currency and cannot self-protect. This test
    // pins that fact so nobody later assumes the conversion is safe on its own.
    expect(fiatMinorToUsdcMinor(1250n)).toBe(12500000n);
  });
});

describe("sum", () => {
  it("sums bigints", () => {
    expect(sum([1n, 2n, 3n])).toBe(6n);
    expect(sum([])).toBe(0n);
  });
});
