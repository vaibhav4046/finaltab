import { z } from "zod";
import {
  clearInviteHandoffCookie,
  inviteHandoffCookie,
  inviteHandoffFromCookie,
  INVITE_HANDOFF_TTL_SECONDS,
  sealInviteHandoff,
} from "@/lib/server/inviteHandoff";
import {
  InviteTokenSchema,
  invalidBody,
  privateJson,
  readCloudJson,
  rejectCrossOriginMutation,
} from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";

const HandoffSchema = z.object({ token: InviteTokenSchema }).strict();

export async function GET(request: Request) {
  return privateJson({
    ok: true,
    available: inviteHandoffFromCookie(request.headers.get("cookie")) !== null,
  });
}

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  let body: z.infer<typeof HandoffSchema>;
  try {
    body = HandoffSchema.parse(await readCloudJson(request));
  } catch (error) {
    return invalidBody(error);
  }
  const sealed = sealInviteHandoff(body.token);
  if (!sealed) {
    return privateJson({
      ok: false,
      error: "INVITE_HANDOFF_UNAVAILABLE",
      message: "Secure invite handoff is not configured on this deployment.",
    }, { status: 503 });
  }
  const response = privateJson({ ok: true, available: true });
  response.headers.set("set-cookie", inviteHandoffCookie(sealed, request.url, INVITE_HANDOFF_TTL_SECONDS));
  return response;
}

export async function DELETE(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const response = privateJson({ ok: true, available: false });
  response.headers.set("set-cookie", clearInviteHandoffCookie(request.url));
  return response;
}
