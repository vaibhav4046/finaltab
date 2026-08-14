import { checkReceiptArithmetic, reconcileAllocation, sharesToDebts } from "@finaltab/engine";
import type { z } from "zod";
import type { SaveTabDraftSchema } from "@/lib/tabDraft";

function sortedDebts(debts: Array<{ debtor: string; creditor: string; usdcMinor: string }>) {
  return [...debts].sort((left, right) =>
    `${left.debtor}:${left.creditor}:${left.usdcMinor}`.localeCompare(`${right.debtor}:${right.creditor}:${right.usdcMinor}`),
  );
}

export function validateReconciledDraft(body: z.infer<typeof SaveTabDraftSchema>): string | null {
  if (checkReceiptArithmetic(body.receiptState.receipt).length > 0 || body.receiptState.arithmeticIssues.length > 0) {
    return "Only a confirmed, arithmetically valid receipt can be saved.";
  }
  if (!body.allocationState) return null;
  if (!body.payerParticipantId) return "A reconciled allocation requires a payer.";
  const allocation = body.allocationState;
  const reconciled = reconcileAllocation(body.receiptState.receipt, allocation.proposal);
  if (!reconciled.ok || !reconciled.shares) return "The allocation no longer reconciles to this receipt.";

  const actualShares = new Map(allocation.shares.map((share) => [share.id, share.fiatMinor]));
  if (actualShares.size !== reconciled.shares.size) return "The saved shares do not match the reconciler output.";
  for (const [participantId, amount] of reconciled.shares) {
    if (actualShares.get(participantId) !== amount.toString()) return "The saved shares do not match the reconciler output.";
  }
  const expectedDebts = sharesToDebts(reconciled.shares, body.payerParticipantId)
    .map((debt) => ({ debtor: debt.debtor, creditor: debt.creditor, usdcMinor: debt.amount.toString() }));
  if (JSON.stringify(sortedDebts(allocation.debts)) !== JSON.stringify(sortedDebts(expectedDebts))) {
    return "The saved debt graph does not match the reconciler output.";
  }
  if (!allocation.settlement.eligible || allocation.settlement.currency !== "USD") {
    return "Durable FINALTab settlement drafts must remain USD eligible.";
  }
  return null;
}
