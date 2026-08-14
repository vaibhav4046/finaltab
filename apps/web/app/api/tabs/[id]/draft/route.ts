import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DurableAllocationStateSchema, DurableReceiptStateSchema, SaveTabDraftSchema } from "@/lib/tabDraft";
import {
  databaseUnavailable,
  invalidBody,
  privateJson,
  readCloudJson,
  rejectCrossOriginMutation,
  requireCloudUser,
} from "@/lib/server/tabCollaboration";
import { validateReconciledDraft } from "@/lib/server/tabDraftValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Id = z.string().uuid();
const MAX_DRAFT_REQUEST_BYTES = 300_000;

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return value[0] && typeof value[0] === "object" ? value[0] as Record<string, unknown> : null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const idResult = Id.safeParse((await context.params).id);
  if (!idResult.success) return invalidBody(idResult.error);
  const tabId = idResult.data;
  const admin = createAdminSupabaseClient();
  if (!admin) return databaseUnavailable("CLOUD_ADMIN_NOT_CONFIGURED");
  const { data, error } = await admin.rpc("get_tab_draft", {
    target_tab: tabId,
    expected_actor: auth.user.id,
  });
  if (error) return databaseUnavailable("TAB_DRAFT_READ_FAILED");
  const row = firstRow(data);
  if (!row) {
    return privateJson({ ok: false, error: "TAB_NOT_FOUND", message: "Tab was not found or is not shared with this account." }, { status: 404 });
  }
  if (typeof row.tab_status !== "string") return databaseUnavailable("TAB_DRAFT_INVALID");
  if (row.tab_status !== "open" || row.saved_revision === null) {
    return privateJson({ ok: true, tabStatus: row.tab_status, draft: null });
  }
  const receipt = DurableReceiptStateSchema.safeParse(row.saved_receipt_state);
  const allocation = row.saved_allocation_state === null
    ? { success: true as const, data: null }
    : DurableAllocationStateSchema.safeParse(row.saved_allocation_state);
  if (!receipt.success || !allocation.success) return databaseUnavailable("TAB_DRAFT_INVALID");
  return privateJson({
    ok: true,
    tabStatus: row.tab_status,
    draft: {
      revision: Number(row.saved_revision),
      receiptState: receipt.data,
      allocationState: allocation.data,
      payerParticipantId: row.saved_payer_participant_id,
      updatedAt: row.saved_updated_at,
    },
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const idResult = Id.safeParse((await context.params).id);
  if (!idResult.success) return invalidBody(idResult.error);

  let body: z.infer<typeof SaveTabDraftSchema>;
  try {
    body = SaveTabDraftSchema.parse(await readCloudJson(request, MAX_DRAFT_REQUEST_BYTES));
  } catch (error) {
    return invalidBody(error);
  }
  const reconciliationError = validateReconciledDraft(body);
  if (reconciliationError) {
    return privateJson({ ok: false, error: "DRAFT_RECONCILIATION_FAILED", message: reconciliationError }, { status: 422 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) return databaseUnavailable("CLOUD_ADMIN_NOT_CONFIGURED");
  const requestDigest = digest({
    receiptState: body.receiptState,
    allocationState: body.allocationState,
    payerParticipantId: body.payerParticipantId,
  });
  const { data, error } = await admin.rpc("upsert_tab_draft", {
    target_tab: idResult.data,
    expected_actor: auth.user.id,
    expected_revision: body.expectedRevision,
    receipt_document: body.receiptState,
    allocation_document: body.allocationState,
    selected_payer: body.payerParticipantId,
    request_digest: requestDigest,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("tab editor access required")) {
      return privateJson({ ok: false, error: "EDITOR_REQUIRED", message: "Only an owner or member can update this draft." }, { status: 403 });
    }
    if (message.includes("draft revision conflict")) {
      return privateJson({ ok: false, error: "DRAFT_CONFLICT", message: "This tab changed elsewhere. Reload before saving again." }, { status: 409 });
    }
    if (message.includes("immutable")) {
      return privateJson({ ok: false, error: "TAB_NOT_OPEN", message: "The frozen settlement source cannot be edited." }, { status: 409 });
    }
    if (message.includes("payer") || message.includes("participant") || message.includes("receipt") || message.includes("allocation")) {
      return privateJson({ ok: false, error: "INVALID_DRAFT_SOURCE", message: "The draft no longer matches this tab." }, { status: 422 });
    }
    return databaseUnavailable("TAB_DRAFT_WRITE_FAILED");
  }
  const row = firstRow(data);
  if (!row) return databaseUnavailable("TAB_DRAFT_WRITE_FAILED");
  return privateJson({
    ok: true,
    revision: Number(row.saved_revision),
    updatedAt: row.saved_updated_at,
    idempotent: row.was_idempotent === true,
  });
}
