/** Apply FINALTab's fail-closed verdict rules to a KeeperHub status payload. */
export function classify(status) {
  const receipts = status.receipts ?? [];
  if (status.status === "pending" || status.status === "submitted") {
    return { verdict: "PENDING", reason: `status is ${status.status} (not terminal)`, receipts };
  }
  if (status.status === "failed" || status.status === "cancelled") {
    return {
      verdict: "FAILED",
      reason: status.error ? `status ${status.status}: ${status.error}` : `status ${status.status}`,
      receipts,
    };
  }
  if (receipts.length === 0) {
    return {
      verdict: "UNPROVEN",
      reason: "status completed but receipts[] is empty — no chain-re-fetched proof",
      receipts,
    };
  }
  for (const receipt of receipts) {
    if (receipt.verified !== true) {
      return {
        verdict: "UNPROVEN",
        reason: `receipt ${receipt.hash} verified=${String(receipt.verified)} — not chain-confirmed`,
        receipts,
      };
    }
    if (receipt.receiptStatus !== "success") {
      const failsClosed =
        receipt.receiptStatus === "not_found" || receipt.receiptStatus === "timeout";
      return {
        verdict: failsClosed ? "UNPROVEN" : "FAILED",
        reason: `receipt ${receipt.hash} receiptStatus=${receipt.receiptStatus}${failsClosed ? " — fails closed" : ""}`,
        receipts,
      };
    }
  }
  return {
    verdict: "VERIFIED_SETTLED",
    reason: "terminal success; every receipt chain-verified successful",
    receipts,
  };
}
