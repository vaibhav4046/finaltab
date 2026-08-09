import type { ExecutionReceipt, ExecutionStatusResponse } from "./types.js";

/**
 * Fail-closed verification. VERIFIED_SETTLED requires ALL of:
 *  - terminal status === "completed"
 *  - receipts[] non-empty (writes always produce receipts; empty = no proof)
 *  - EVERY receipt: verified === true AND receiptStatus === "success"
 * transactionHash/transactionLink are self-reported by the write path — NEVER proof alone.
 * not_found and timeout receiptStatus fail closed.
 */

export type Verdict =
  | { verdict: "VERIFIED_SETTLED"; receipts: ExecutionReceipt[] }
  | { verdict: "FAILED"; reason: string; receipts: ExecutionReceipt[] }
  | { verdict: "UNPROVEN"; reason: string; receipts: ExecutionReceipt[] }
  | { verdict: "PENDING"; reason: string };

export function classifyExecution(status: ExecutionStatusResponse): Verdict {
  const receipts = status.receipts ?? [];

  if (status.status === "pending" || status.status === "submitted") {
    return { verdict: "PENDING", reason: `status is ${status.status} (not terminal)` };
  }

  if (status.status === "failed" || status.status === "cancelled") {
    return {
      verdict: "FAILED",
      reason: status.error ? `status ${status.status}: ${status.error}` : `status ${status.status}`,
      receipts,
    };
  }

  // status === "completed" from here
  if (receipts.length === 0) {
    return {
      verdict: "UNPROVEN",
      reason: "status completed but receipts[] is empty — no chain-re-fetched proof exists",
      receipts,
    };
  }

  for (const r of receipts) {
    if (r.verified !== true) {
      return {
        verdict: "UNPROVEN",
        reason: `receipt ${r.hash} has verified=${String(r.verified)} — chain re-fetch has not confirmed it`,
        receipts,
      };
    }
    if (r.receiptStatus !== "success") {
      const failClosed = r.receiptStatus === "not_found" || r.receiptStatus === "timeout";
      return failClosed
        ? {
            verdict: "UNPROVEN",
            reason: `receipt ${r.hash} receiptStatus=${r.receiptStatus} — fails closed`,
            receipts,
          }
        : {
            verdict: "FAILED",
            reason: `receipt ${r.hash} receiptStatus=${r.receiptStatus}`,
            receipts,
          };
    }
  }

  return { verdict: "VERIFIED_SETTLED", receipts };
}
