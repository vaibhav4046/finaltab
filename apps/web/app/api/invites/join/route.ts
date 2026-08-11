import { databaseUnavailable, hashInviteToken, invalidBody, JoinInviteSchema, privateJson, readCloudJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;

  let body: ReturnType<typeof JoinInviteSchema.parse>;
  try {
    body = JoinInviteSchema.parse(await readCloudJson(request));
  } catch (error) {
    return invalidBody(error);
  }

  const { data, error } = await auth.client.rpc("accept_tab_invite", {
    token_digest: hashInviteToken(body.token),
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("invalid or expired")) {
      return privateJson({ ok: false, error: "INVITE_INVALID_OR_EXPIRED", message: "This invite is invalid, expired, or has already been used." }, { status: 410 });
    }
    if (message.includes("already a participant")) {
      return privateJson({ ok: false, error: "ALREADY_JOINED", message: "This account already belongs to the tab." }, { status: 409 });
    }
    return databaseUnavailable("INVITE_JOIN_FAILED");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return databaseUnavailable("INVITE_JOIN_FAILED");
  return privateJson({ ok: true, tab: { id: row.tab_id, title: row.tab_title }, participantId: row.participant_id });
}
