import { z } from "zod";
import { databaseUnavailable, invalidBody, privateJson, readCloudJson, rejectCrossOriginMutation, requireCloudUser, UpdateTabSchema } from "@/lib/server/tabCollaboration";
import type { CloudApproval, CloudAuditEvent, CloudParticipant, CloudTabDetail, CloudTabRole, CloudTabStatus } from "@/lib/cloudTabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Id = z.string().uuid();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const idResult = Id.safeParse((await context.params).id);
  if (!idResult.success) return invalidBody(idResult.error);
  const tabId = idResult.data;

  const [tabResult, memberResult, participantsResult, approvalsResult, auditResult] = await Promise.all([
    auth.client
      .from("tabs")
      .select("id,title,currency,status,owner_id,payer_participant_id,created_at,updated_at")
      .eq("id", tabId)
      .maybeSingle(),
    auth.client.from("tab_members").select("role").eq("tab_id", tabId).eq("user_id", auth.user.id).maybeSingle(),
    auth.client
      .from("participants")
      .select("id,display_name,wallet_address,user_id,invite_status,invite_expires_at,created_at")
      .eq("tab_id", tabId)
      .order("created_at", { ascending: true }),
    auth.client.rpc("list_tab_approval_summaries", { target_tab: tabId }),
    auth.client
      .from("audit_events")
      .select("id,actor_id,action,metadata,created_at")
      .eq("tab_id", tabId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (tabResult.error || !tabResult.data) {
    return privateJson({ ok: false, error: "TAB_NOT_FOUND", message: "Tab was not found or is not shared with this account." }, { status: 404 });
  }
  if (memberResult.error || participantsResult.error || approvalsResult.error || auditResult.error) {
    return databaseUnavailable("TAB_READ_FAILED");
  }

  const tab = tabResult.data;
  const participants: CloudParticipant[] = ((participantsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    displayName: String(row.display_name),
    walletAddress: row.wallet_address ? String(row.wallet_address) as `0x${string}` : null,
    userId: row.user_id ? String(row.user_id) : null,
    inviteStatus: String(row.invite_status) as CloudParticipant["inviteStatus"],
    inviteExpiresAt: row.invite_expires_at ? String(row.invite_expires_at) : null,
  }));
  const approvals: CloudApproval[] = ((approvalsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    participantId: String(row.participant_id),
    userId: row.user_id ? String(row.user_id) : null,
    walletAddress: String(row.wallet_address) as `0x${string}`,
    planHash: String(row.plan_hash) as `0x${string}`,
    debitMinor: String(row.debit_minor),
    status: String(row.status) as CloudApproval["status"],
    expiresAt: String(row.expires_at),
    signedAt: row.signed_at ? String(row.signed_at) : null,
    updatedAt: String(row.updated_at),
  }));
  const audit: CloudAuditEvent[] = ((auditResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    actorId: row.actor_id ? String(row.actor_id) : null,
    action: String(row.action),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
    createdAt: String(row.created_at),
  }));
  const detail: CloudTabDetail = {
    id: tab.id,
    title: tab.title,
    currency: tab.currency,
    status: tab.status as CloudTabStatus,
    role: (memberResult.data?.role ?? (tab.owner_id === auth.user.id ? "owner" : "member")) as CloudTabRole,
    participantCount: participants.length,
    createdAt: tab.created_at,
    updatedAt: tab.updated_at,
    ownerId: tab.owner_id,
    payerParticipantId: tab.payer_participant_id,
    currentUserId: auth.user.id,
    participants,
    approvals,
    audit,
  };
  return privateJson({ ok: true, tab: detail });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const idResult = Id.safeParse((await context.params).id);
  if (!idResult.success) return invalidBody(idResult.error);

  let body: ReturnType<typeof UpdateTabSchema.parse>;
  try {
    body = UpdateTabSchema.parse(await readCloudJson(request));
  } catch (error) {
    return invalidBody(error);
  }

  if (body.payerParticipantId) {
    const { data: payer, error } = await auth.client
      .from("participants")
      .select("id")
      .eq("id", body.payerParticipantId)
      .eq("tab_id", idResult.data)
      .maybeSingle();
    if (error || !payer) {
      return privateJson({ ok: false, error: "PAYER_NOT_IN_TAB", message: "The payer must be a participant in this tab." }, { status: 422 });
    }
  }

  const patch: Record<string, string | null> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.payerParticipantId !== undefined) patch.payer_participant_id = body.payerParticipantId;
  const { data, error } = await auth.client
    .from("tabs")
    .update(patch)
    .eq("id", idResult.data)
    .select("id,title,currency,status,owner_id,payer_participant_id,created_at,updated_at")
    .maybeSingle();
  if (error) return databaseUnavailable("TAB_UPDATE_FAILED");
  if (!data) {
    return privateJson({ ok: false, error: "OWNER_REQUIRED", message: "Only the tab owner can update draft details." }, { status: 403 });
  }
  return privateJson({ ok: true, tab: data });
}
