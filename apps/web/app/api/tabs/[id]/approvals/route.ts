import { z } from "zod";
import { ApprovalDecisionSchema, databaseUnavailable, invalidBody, privateJson, readCloudJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";

const Id = z.string().uuid();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const idResult = Id.safeParse((await context.params).id);
  if (!idResult.success) return invalidBody(idResult.error);

  let body: ReturnType<typeof ApprovalDecisionSchema.parse>;
  try {
    body = ApprovalDecisionSchema.parse(await readCloudJson(request));
  } catch (error) {
    return invalidBody(error);
  }

  const { data, error } = await auth.client.rpc("record_approval_decision", {
    target_tab: idResult.data,
    target_approval: body.approvalId,
    target_status: body.status,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not found for authenticated debtor wallet")) {
      return privateJson({ ok: false, error: "DEBTOR_WALLET_REQUIRED", message: "Only the authenticated debtor linked to this exact wallet can change the approval." }, { status: 403 });
    }
    if (message.includes("current state") || message.includes("pending approval")) {
      return privateJson({ ok: false, error: "APPROVAL_STATE_CONFLICT", message: error.message }, { status: 409 });
    }
    return databaseUnavailable("APPROVAL_UPDATE_FAILED");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return databaseUnavailable("APPROVAL_UPDATE_FAILED");
  return privateJson({ ok: true, approval: { id: row.approval_id, status: row.status, updatedAt: row.updated_at } });
}
