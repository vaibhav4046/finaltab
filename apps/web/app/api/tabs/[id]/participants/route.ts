import { z } from "zod";
import { AddParticipantSchema, databaseUnavailable, invalidBody, privateJson, readCloudJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";

const Id = z.string().uuid();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const idResult = Id.safeParse((await context.params).id);
  if (!idResult.success) return invalidBody(idResult.error);

  let body: ReturnType<typeof AddParticipantSchema.parse>;
  try {
    body = AddParticipantSchema.parse(await readCloudJson(request));
  } catch (error) {
    return invalidBody(error);
  }

  const { data, error } = await auth.client.rpc("add_tab_participant", {
    target_tab: idResult.data,
    participant_name: body.displayName,
    participant_wallet: body.walletAddress,
    attach_to_self: body.attachSelf,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("editor access")) {
      return privateJson({ ok: false, error: "EDITOR_REQUIRED", message: "Only owners and members can add participants." }, { status: 403 });
    }
    if (error.code === "23505") {
      return privateJson({ ok: false, error: "PARTICIPANT_EXISTS", message: "That participant or wallet is already on this tab." }, { status: 409 });
    }
    return databaseUnavailable("PARTICIPANT_CREATE_FAILED");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return databaseUnavailable("PARTICIPANT_CREATE_FAILED");
  return privateJson({
    ok: true,
    participant: {
      id: row.id,
      displayName: row.display_name,
      walletAddress: row.wallet_address,
      userId: row.user_id,
      inviteStatus: row.invite_status,
      inviteExpiresAt: null,
    },
  }, { status: 201 });
}
