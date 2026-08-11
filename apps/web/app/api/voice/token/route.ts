import { authorizeApiRequest, withAccessHeaders } from "@/lib/server/apiAccess";
import { createAssemblyStreamingSession, VoiceProviderError } from "@/lib/server/voice";
import {
  reserveDurableVoiceBudget,
  VOICE_STT_RESERVATION_SECONDS,
  VoiceQuotaError,
  voiceQuotaRetryAfterSeconds,
  withVoiceQuotaHeaders,
} from "@/lib/server/voiceQuota";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeApiRequest(request, {
    scope: "receipts:write",
    maxBytes: 0,
    rateLimit: 8,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);

  // This endpoint has no request payload. Reject even a chunked body so a
  // token mint can never become an unbounded upload surface.
  if (request.body) {
    return secured(Response.json({ error: "BODY_NOT_ALLOWED" }, { status: 400 }));
  }

  let quota;
  try {
    // Reserve the full provider-enforced session allowance before a temporary
    // credential exists. A failed mint remains conservatively reserved.
    quota = await reserveDurableVoiceBudget(
      access.principal,
      "transcription",
      VOICE_STT_RESERVATION_SECONDS,
    );
  } catch (error) {
    if (error instanceof VoiceQuotaError) {
      return secured(Response.json(
        {
          error: error.code === "SESSION_REQUIRED" ? "VOICE_SESSION_REQUIRED" : "VOICE_BUDGET_UNAVAILABLE",
          message: error.code === "SESSION_REQUIRED"
            ? "Voice sessions require a signed-in Supabase user."
            : "Durable voice budgets are unavailable; no provider request was made.",
        },
        { status: error.httpStatus },
      ));
    }
    return secured(Response.json(
      { error: "VOICE_BUDGET_UNAVAILABLE", message: "Durable voice budgets are unavailable; no provider request was made." },
      { status: 503 },
    ));
  }
  if (!quota.allowed) {
    const error = quota.reason === "minute_limit"
      ? "VOICE_RATE_LIMITED"
      : quota.reason.endsWith("concurrency")
        ? "VOICE_CONCURRENCY_LIMITED"
        : "VOICE_BUDGET_EXHAUSTED";
    const response = Response.json(
      { error, reason: quota.reason, resetsAt: quota.retryAt },
      { status: 429, headers: { "retry-after": String(voiceQuotaRetryAfterSeconds(quota.retryAt)) } },
    );
    return secured(withVoiceQuotaHeaders(response, quota));
  }

  try {
    const session = await createAssemblyStreamingSession();
    return secured(withVoiceQuotaHeaders(Response.json(session, {
      headers: {
        "cache-control": "private, no-store",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      },
    }), quota));
  } catch (error) {
    if (error instanceof VoiceProviderError) {
      const message = error.code === "NOT_CONFIGURED"
        ? "AssemblyAI transcription is not configured on the server."
        : "AssemblyAI could not start a transcription session.";
      return secured(withVoiceQuotaHeaders(
        Response.json({ error: error.code, message }, { status: error.httpStatus }),
        quota,
      ));
    }
    return secured(withVoiceQuotaHeaders(
      Response.json(
        { error: "UPSTREAM_UNAVAILABLE", message: "AssemblyAI could not start a transcription session." },
        { status: 502 },
      ),
      quota,
    ));
  }
}
