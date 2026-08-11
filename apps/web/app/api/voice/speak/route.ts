import { ApiPayloadTooLargeError, authorizeApiRequest, readJsonBodyWithLimit, withAccessHeaders } from "@/lib/server/apiAccess";
import { streamElevenLabsSpeech, VoiceProviderError, VoiceSpeechBodySchema } from "@/lib/server/voice";
import {
  reserveDurableVoiceBudget,
  VoiceQuotaError,
  voiceQuotaRetryAfterSeconds,
  withVoiceQuotaHeaders,
} from "@/lib/server/voiceQuota";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 2_048;

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeApiRequest(request, {
    scope: "tabs:read",
    maxBytes: MAX_BODY_BYTES,
    rateLimit: 20,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);

  let text: string;
  try {
    const parsed = VoiceSpeechBodySchema.parse(await readJsonBodyWithLimit(request, MAX_BODY_BYTES));
    text = parsed.text;
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) {
      return secured(Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes: error.maxBytes }, { status: 413 }));
    }
    return secured(Response.json({ error: "INVALID_VOICE_TEXT" }, { status: 400 }));
  }

  let quota;
  try {
    // JavaScript string length counts UTF-16 code units, which is never lower
    // than the normalized Unicode code-point count. It is therefore a safe,
    // conservative reservation for provider character usage.
    quota = await reserveDurableVoiceBudget(access.principal, "readback", text.length);
  } catch (error) {
    if (error instanceof VoiceQuotaError) {
      return secured(Response.json(
        {
          error: error.code === "SESSION_REQUIRED" ? "VOICE_SESSION_REQUIRED" : "VOICE_BUDGET_UNAVAILABLE",
          message: error.code === "SESSION_REQUIRED"
            ? "Voice readback requires a signed-in Supabase user."
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
      : "VOICE_BUDGET_EXHAUSTED";
    const response = Response.json(
      { error, reason: quota.reason, resetsAt: quota.retryAt },
      { status: 429, headers: { "retry-after": String(voiceQuotaRetryAfterSeconds(quota.retryAt)) } },
    );
    return secured(withVoiceQuotaHeaders(response, quota));
  }

  try {
    const upstream = await streamElevenLabsSpeech(text);
    const headers = new Headers({
      "content-type": "audio/mpeg",
      "cache-control": "private, no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength && /^\d+$/.test(contentLength)) headers.set("content-length", contentLength);
    return secured(withVoiceQuotaHeaders(new Response(upstream.body, { status: 200, headers }), quota));
  } catch (error) {
    if (error instanceof VoiceProviderError) {
      const message = error.code === "NOT_CONFIGURED"
        ? "ElevenLabs readback is not configured on the server."
        : "ElevenLabs could not generate the spoken readback.";
      return secured(withVoiceQuotaHeaders(
        Response.json({ error: error.code, message }, { status: error.httpStatus }),
        quota,
      ));
    }
    return secured(withVoiceQuotaHeaders(
      Response.json(
        { error: "UPSTREAM_UNAVAILABLE", message: "ElevenLabs could not generate the spoken readback." },
        { status: 502 },
      ),
      quota,
    ));
  }
}
