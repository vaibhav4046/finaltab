import { clearInviteHandoffCookie, inviteHandoffFromCookie } from "@/lib/server/inviteHandoff";
import { databaseUnavailable, hashInviteToken, privateJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;

  const token = inviteHandoffFromCookie(request.headers.get("cookie"));
  if (!token) {
    const response = privateJson({
      ok: false,
      error: "INVITE_HANDOFF_REQUIRED",
      message: "Open the original invite link before joining.",
    }, { status: 410 });
    response.headers.set("set-cookie", clearInviteHandoffCookie(request.url));
    return response;
  }

  const { data, error } = await auth.client.rpc("accept_tab_invite", {
    token_digest: hashInviteToken(token),
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("invalid or expired")) {
      const response = privateJson({ ok: false, error: "INVITE_INVALID_OR_EXPIRED", message: "This invite is invalid, expired, or has already been used." }, { status: 410 });
      response.headers.set("set-cookie", clearInviteHandoffCookie(request.url));
      return response;
    }
    if (message.includes("already a participant")) {
      const response = privateJson({ ok: false, error: "ALREADY_JOINED", message: "This account already belongs to the tab." }, { status: 409 });
      response.headers.set("set-cookie", clearInviteHandoffCookie(request.url));
      return response;
    }
    return databaseUnavailable("INVITE_JOIN_FAILED");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return databaseUnavailable("INVITE_JOIN_FAILED");
  const response = privateJson({ ok: true, tab: { id: row.tab_id, title: row.tab_title }, participantId: row.participant_id });
  response.headers.set("set-cookie", clearInviteHandoffCookie(request.url));
  return response;
}
