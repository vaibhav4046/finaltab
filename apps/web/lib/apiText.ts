/**
 * Coercion for untyped API payloads that end up rendered as React children.
 *
 * `await res.json()` is `any`, so `setError(json.error ?? "…")` type-checks even
 * when the route returns an object under that key. React then throws
 * "Objects are not valid as a React child" and the whole page white-screens —
 * which is exactly the wrong failure mode for an app whose claim is that it
 * renders honest failures instead of hiding them.
 *
 * Every value that crosses from a fetch response into displayable state must go
 * through here first.
 */

const MAX_LEN = 400;

function clamp(s: string): string {
  return s.length > MAX_LEN ? `${s.slice(0, MAX_LEN - 1)}…` : s;
}

/**
 * Render any JSON value as a single display string.
 * Falls back when the value is absent, blank, or not serialisable.
 */
export function toDisplayText(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? clamp(trimmed) : fallback;
  }
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Error) return clamp(value.message) || fallback;
  try {
    const json = JSON.stringify(value);
    // JSON.stringify returns undefined for functions/symbols.
    if (!json || json === "{}" || json === "[]") return fallback;
    return clamp(json);
  } catch {
    return fallback;
  }
}

/**
 * Read `{ error }` off an error response body.
 * Routes are supposed to send a string; this survives it being anything else.
 */
export function apiErrorText(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return toDisplayText(body, fallback);
  return toDisplayText((body as Record<string, unknown>).error, fallback);
}

/**
 * Human-readable reason for a 409 "would revert".
 *
 * `/api/settle/simulate` answers `{ ok:false, wouldRevert:true, detail, message }`
 * with **no `error` key** and an object-valued `detail`. Both halves matter to a
 * judge reading the blocked state, so both are surfaced.
 */
export function revertText(body: unknown): string {
  const FALLBACK = "would revert";
  if (typeof body !== "object" || body === null) return toDisplayText(body, FALLBACK);
  const record = body as Record<string, unknown>;

  const head = toDisplayText(record.message, "");
  const detail = toDisplayText(record.detail, "");

  if (head && detail && head !== detail) return clamp(`${head} — ${detail}`);
  return head || detail || FALLBACK;
}
