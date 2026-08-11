import { ApiPayloadTooLargeError, authorizeApiRequest, readJsonBodyWithLimit, withAccessHeaders } from "@/lib/server/apiAccess";
import { freezeDurableSettlement } from "@/lib/server/settlementFlow";
import { invalidBody, privateJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;
const MAX_FREEZE_BYTES = 256 * 1024;

function statusFor(message: string): number {
  if (/NOT_FOUND|MISSING/.test(message)) return 404;
  if (/NOT_CONFIGURED|contract address/.test(message)) return 501;
  if (/MISMATCH|CHANGED|NOT_READY|NO_LONGER|DUPLICATE/.test(message)) return 409;
  if (/OUT_OF_BOUNDS|INVALID/.test(message)) return 422;
  return 503;
}

export async function POST(request: Request): Promise<Response> {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const access = await authorizeApiRequest(request, {
    scope: "settlements:prepare",
    maxBytes: MAX_FREEZE_BYTES,
    rateLimit: 12,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);
  const auth = await requireCloudUser();
  if (!auth.ok) return secured(auth.response);
  if (access.principal.subject !== auth.user.id) return secured(privateJson({ ok: false, error: "PRINCIPAL_MISMATCH" }, { status: 403 }));
  try {
    const input = await readJsonBodyWithLimit(request, MAX_FREEZE_BYTES);
    const mutationClient = createAdminSupabaseClient();
    if (!mutationClient) {
      return secured(privateJson({ ok: false, error: "SETTLEMENT_PERSISTENCE_NOT_CONFIGURED", message: "Server-side settlement persistence is unavailable." }, { status: 503 }));
    }
    const result = await freezeDurableSettlement(auth.client, mutationClient, auth.user.id, input);
    return secured(privateJson({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 }));
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) return secured(invalidBody(error));
    const message = error instanceof Error ? error.message : "The reviewed ledger could not be frozen.";
    return secured(privateJson({ ok: false, error: "FLOW_FREEZE_REJECTED", message }, { status: statusFor(message) }));
  }
}
