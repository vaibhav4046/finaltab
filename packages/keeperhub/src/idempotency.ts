import { createHash } from "node:crypto";

/**
 * Canonical idempotency key per KeeperHub docs:
 *   taskId|chainId|recipientAddress|amount|tokenAddress
 * - separator U+007C
 * - taskId trimmed, % -> %25 first, then | -> %7C
 * - chainId as decimal integer
 * - addresses lowercased
 * - amount canonical decimal string (no exponent, leading digit required,
 *   strip leading zeros in whole part and trailing zeros in fraction; empty -> "0")
 * - omitted optional fields = empty string
 * SHA-256 over UTF-8, lowercase hex.
 */

export function canonicalAmount(input: string): string {
  const s = input.trim();
  if (s === "") return "0";
  if (!/^\d+(\.\d*)?$/.test(s) && !/^\.\d+$/.test(s)) {
    throw new Error(`canonicalAmount: not a plain decimal: "${input}"`);
  }
  const [wholeRaw = "", fracRaw = ""] = s.split(".");
  // `^0+` is anchored, so it is attempted from one position and scans once.
  // A trailing `0+$` is not anchored: the engine retries from every position
  // inside a run of zeros, which is quadratic in the length of the fraction.
  // The trailing zeros are therefore stripped by index instead. This is a
  // value-bearing function, so the output must stay byte-identical.
  let whole = wholeRaw.replace(/^0+/, "");
  let fracEnd = fracRaw.length;
  while (fracEnd > 0 && fracRaw[fracEnd - 1] === "0") fracEnd -= 1;
  const frac = fracRaw.slice(0, fracEnd);
  if (whole === "") whole = "0";
  const out = frac === "" ? whole : `${whole}.${frac}`;
  return out === "0." ? "0" : out;
}

function escapeTaskId(taskId: string): string {
  return taskId.trim().replaceAll("%", "%25").replaceAll("|", "%7C");
}

export interface IdempotencyParts {
  taskId?: string;
  chainId: number;
  recipientAddress: string;
  amount: string;
  tokenAddress?: string;
}

export function canonicalIdempotencyString(parts: IdempotencyParts): string {
  const taskId = parts.taskId ? escapeTaskId(parts.taskId) : "";
  const chainId = String(Math.trunc(parts.chainId));
  const recipient = parts.recipientAddress.toLowerCase();
  const amount = canonicalAmount(parts.amount);
  const token = parts.tokenAddress ? parts.tokenAddress.toLowerCase() : "";
  return [taskId, chainId, recipient, amount, token].join("|");
}

export function deriveIdempotencyKey(parts: IdempotencyParts): string {
  return createHash("sha256").update(canonicalIdempotencyString(parts), "utf8").digest("hex");
}
