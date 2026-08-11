import { z } from "zod";
import { CreateInviteSchema, createInviteToken, databaseUnavailable, hashInviteToken, invalidBody, inviteExpiry, privateJson, readCloudJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";

const Id = z.string().uuid();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const idResult = Id.safeParse((await context.params).id);
  if (!idResult.success) return invalidBody(idResult.error);

  let body: ReturnType<typeof CreateInviteSchema.parse>;
  try {
    body = CreateInviteSchema.parse(await readCloudJson(request));
  } catch (error) {
    return invalidBody(error);
  }

  const token = createInviteToken();
  const expiresAt = inviteExpiry(body.expiresInHours);
  const { data, error } = await auth.client.rpc("create_tab_invite", {
    target_participant: body.participantId,
    token_digest: hashInviteToken(token),
    requested_expires_at: expiresAt,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not found")) return privateJson({ ok: false, error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });
    if (message.includes("editor access")) return privateJson({ ok: false, error: "EDITOR_REQUIRED" }, { status: 403 });
    if (message.includes("already joined")) return privateJson({ ok: false, error: "ALREADY_JOINED" }, { status: 409 });
    return databaseUnavailable("INVITE_CREATE_FAILED");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.tab_id !== idResult.data) return databaseUnavailable("INVITE_CREATE_FAILED");

  const inviteUrl = new URL("/join", request.url);
  inviteUrl.hash = token;
  return privateJson({ ok: true, invite: { participantId: body.participantId, inviteUrl: inviteUrl.toString(), expiresAt } }, { status: 201 });
}
