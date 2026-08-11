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
  const receipts = Array.isArray(status.receipts) ? status.receipts : [];
  const state = String(status.status);

  if (state === "pending" || state === "submitted") {
    return { verdict: "PENDING", reason: `status is ${state} (not terminal)` };
  }

  if (state === "failed" || state === "cancelled") {
    return {
      verdict: "FAILED",
      reason: status.error ? `status ${state}: ${status.error}` : `status ${state}`,
      receipts,
    };
  }

  if (state !== "completed") {
    return {
      verdict: "UNPROVEN",
      reason: `unknown execution status ${JSON.stringify(state)} — fails closed`,
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
    if (
      !r ||
      typeof r.hash !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(r.hash) ||
      typeof r.chainId !== "number" ||
      typeof r.verified !== "boolean" ||
      typeof r.receiptStatus !== "string"
    ) {
      return {
        verdict: "UNPROVEN",
        reason: "KeeperHub returned a malformed receipt — fails closed",
        receipts,
      };
    }
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
