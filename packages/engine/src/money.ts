/**
 * All money is integer minor units (bigint). Floats never touch money.
 * Receipts are fiat with 2 decimals; USDC on chain uses 6 decimals.
 */

export const FIAT_DECIMALS = 2;
export const USDC_DECIMALS = 6;

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

/** Parse a human decimal string ("12.34") into minor units. Rejects floats, negatives, exponents. */
export function parseAmount(input: string, decimals: number): bigint {
  const s = input.trim();
  const m = DECIMAL_RE.exec(s);
  if (!m) throw new Error(`Invalid amount: "${input}"`);
  const whole = m[1]!;
  const frac = m[2] ?? "";
  if (frac.length > decimals) {
    throw new Error(`Amount "${input}" has more than ${decimals} decimal places`);
  }
  const fracPadded = frac.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded === "" ? 0 : fracPadded);
}

/** Format minor units back to a canonical decimal string. */
export function formatAmount(minor: bigint, decimals: number): string {
  if (minor < 0n) throw new Error("Negative amounts are not representable");
  const base = 10n ** BigInt(decimals);
  const whole = minor / base;
  const frac = (minor % base).toString().padStart(decimals, "0");
  return decimals === 0 ? whole.toString() : `${whole}.${frac}`;
}

export const parseFiat = (s: string) => parseAmount(s, FIAT_DECIMALS);
export const formatFiat = (m: bigint) => formatAmount(m, FIAT_DECIMALS);
export const parseUsdc = (s: string) => parseAmount(s, USDC_DECIMALS);
export const formatUsdc = (m: bigint) => formatAmount(m, USDC_DECIMALS);

/** Fiat minor units (2dp) -> USDC minor units (6dp). Exact: multiply by 10^4. */
export function fiatMinorToUsdcMinor(fiatMinor: bigint): bigint {
  return fiatMinor * 10n ** BigInt(USDC_DECIMALS - FIAT_DECIMALS);
}

export function sum(values: readonly bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n);
}
