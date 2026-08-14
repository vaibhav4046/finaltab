import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SaveTabDraftSchema } from "@/lib/tabDraft";
import { validateReconciledDraft } from "@/lib/server/tabDraftValidation";

const PAYER = "00000000-0000-4000-8000-000000000001";
const DINER = "00000000-0000-4000-8000-000000000002";

function validDraft() {
  return {
    expectedRevision: 0,
    receiptState: {
      receipt: {
        merchant: "North Line Kitchen",
        date: null,
        currency: "USD",
        items: [{ description: "Shared plate", quantity: 1, unitPrice: "10.00", lineTotal: "10.00" }],
        subtotal: "10.00",
        tax: null,
        tip: null,
        serviceCharge: null,
        total: "10.00",
        confidence: 0.99,
      },
      attempts: 1,
      provider: "groq",
      arithmeticIssues: [],
      imageDataUrl: "" as const,
      confirmedAt: "2026-08-12T09:00:00.000Z",
    },
    allocationState: {
      proposal: {
        allocations: [{ itemIndex: 0, participants: [PAYER, DINER] }],
        payerId: PAYER,
      },
      instruction: "Split the shared plate equally.",
      shares: [{ id: PAYER, fiatMinor: "500" }, { id: DINER, fiatMinor: "500" }],
      debts: [{ debtor: DINER, creditor: PAYER, usdcMinor: "5000000" }],
      settlement: { eligible: true, currency: "USD" },
    },
    payerParticipantId: PAYER,
  };
}

describe("durable pre-freeze tab drafts", () => {
  it("accepts only confirmed, image-free, bounded receipt and reconciled allocation state", () => {
    const parsed = SaveTabDraftSchema.parse(validDraft());
    expect(validateReconciledDraft(parsed)).toBeNull();

    expect(() => SaveTabDraftSchema.parse({
      ...validDraft(),
      receiptState: { ...validDraft().receiptState, confirmedAt: undefined },
    })).toThrow();
    expect(() => SaveTabDraftSchema.parse({
      ...validDraft(),
      receiptState: { ...validDraft().receiptState, imageDataUrl: "data:image/png;base64,secret" },
    })).toThrow();
    expect(() => SaveTabDraftSchema.parse({ ...validDraft(), payerParticipantId: DINER })).toThrow("selected payer");
  });

  it("re-runs deterministic conservation instead of trusting saved shares or debts", () => {
    const wrongShares = validDraft();
    wrongShares.allocationState.shares = [
      { id: PAYER, fiatMinor: "499" },
      { id: DINER, fiatMinor: "501" },
    ];
    expect(validateReconciledDraft(SaveTabDraftSchema.parse(wrongShares)))
      .toContain("reconciler output");

    const wrongDebt = validDraft();
    wrongDebt.allocationState.debts = [{ debtor: DINER, creditor: PAYER, usdcMinor: "4990000" }];
    expect(validateReconciledDraft(SaveTabDraftSchema.parse(wrongDebt)))
      .toContain("debt graph");
  });

  it("keeps the draft table and atomic CAS RPC behind the server trust boundary", () => {
    const migration = readFileSync(fileURLToPath(new URL(
      "../../../supabase/migrations/20260812090000_durable_prefreeze_tab_drafts.sql",
      import.meta.url,
    )), "utf8");
    expect(migration).toContain("alter table public.tab_drafts enable row level security");
    expect(migration).toContain("revoke all on table public.tab_drafts from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("auth.role() is distinct from 'service_role'");
    expect(migration).toContain("tab_drafts_payer_participant_id_idx");
    expect(migration).toContain("tab_drafts_updated_by_idx");
    expect(migration).toContain("payer_participant_id uuid references public.participants(id) on delete cascade");
    expect(migration).toContain("grant insert on table public.audit_events to service_role");
    expect(migration).toContain("grant usage on sequence public.audit_events_id_seq to service_role");
    expect(migration).toContain("public.get_tab_draft(");
    expect(migration).toContain("left join public.tab_drafts d");
    expect(migration).toContain("on d.tab_id = t.id and t.status = 'open'");
    expect(migration).toContain("for share of t");
    expect(migration).toContain("grant execute on function public.get_tab_draft(uuid, uuid)");
    expect(migration).toContain("m.role in ('owner', 'member')");
    expect(migration).toContain("target_status <> 'open'");
    expect(migration).toContain("from public.ledgers l where l.tab_id = target_tab");
    expect(migration).toContain("for update");
    expect(migration).toContain("current_draft.request_hash = request_digest");
    expect(migration).toContain("draft revision conflict");
    expect(migration).toContain("pg_column_size(receipt_document)");
    expect(migration).not.toContain("grant execute on function public.upsert_tab_draft(uuid, uuid, bigint, jsonb, jsonb, uuid, text)\n  to authenticated");
  });

  it("atomically refuses to freeze an older review after the collaborative draft changes", () => {
    const migration = readFileSync(fileURLToPath(new URL(
      "../../../supabase/migrations/20260812090000_durable_prefreeze_tab_drafts.sql",
      import.meta.url,
    )), "utf8");
    expect(migration).toContain("private.assert_latest_tab_draft_matches_flow()");
    expect(migration).toContain("before insert on public.settlement_flow_records");
    expect(migration).toContain("latest_draft.receipt_state -> 'receipt' is distinct from reviewed_input -> 'receipt'");
    expect(migration).toContain("latest_draft.allocation_state -> 'proposal' is distinct from reviewed_input -> 'existingProposal'");
    expect(migration).toContain("latest_draft.allocation_state ->> 'instruction' is distinct from reviewed_input ->> 'instruction'");
    expect(migration).toContain("latest_draft.payer_participant_id::text is distinct from reviewed_input ->> 'payerParticipantId'");
    expect(migration).toContain("LATEST_TAB_DRAFT_MISSING");
    expect(migration).toContain("LATEST_TAB_DRAFT_CHANGED");
    expect(migration).toContain("where d.tab_id = new.tab_id\n  for update");
  });

  it("uses same-origin authenticated routes and never reaches a value action", () => {
    const route = readFileSync(fileURLToPath(new URL("../app/api/tabs/[id]/draft/route.ts", import.meta.url)), "utf8");
    const validation = readFileSync(fileURLToPath(new URL("../lib/server/tabDraftValidation.ts", import.meta.url)), "utf8");
    expect(route).toContain("rejectCrossOriginMutation(request)");
    expect(route).toContain("requireCloudUser()");
    expect(route).toContain("MAX_DRAFT_REQUEST_BYTES");
    expect(route).toContain("validateReconciledDraft(body)");
    expect(validation).toContain("checkReceiptArithmetic");
    expect(validation).toContain("reconcileAllocation");
    expect(validation).toContain("sharesToDebts");
    expect(route).toContain('.rpc("get_tab_draft"');
    expect(route).toContain('.rpc("upsert_tab_draft"');
    expect(route).not.toContain('.from("tab_drafts")');
    expect(route).not.toContain("visibleTab");
    expect(route).not.toMatch(/sign|simulate|submit|broadcast/i);
  });

  it("isolates each tab's save queue and hides stale editable state after freeze", () => {
    const lab = readFileSync(fileURLToPath(new URL("../components/Lab.tsx", import.meta.url)), "utf8");
    expect(lab).toContain("draftContextRef");
    expect(lab).toContain("draftContext.tabId !== cloudTabId");
    expect(lab).toContain("draftContextRef.current !== draftContext");
    expect(lab).toContain("editable pre-freeze draft is hidden");
  });
});
