import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ApiPayloadTooLargeError,
  authorizeApiRequest,
  readJsonBodyWithLimit,
  withAccessHeaders,
} from "@/lib/server/apiAccess";
import { createV3NarrationGenerationStore } from "@/lib/server/v3NarrationGenerationStore";
import {
  runV3NarrationOperator,
  V3_NARRATION_EXACT_CHARACTERS,
  V3_NARRATION_REQUIRED_INCLUDED_CHARACTERS,
  V3_NARRATION_SCRIPT_SHA256,
} from "@/lib/server/v3NarrationOperator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MAX_BODY_BYTES = 64;
const BodySchema = z.object({ mode: z.enum(["preflight", "generate"]) }).strict();
const OPERATOR_CAPABILITY_HEADER = "x-finaltab-v3-narration-token";

function hasDedicatedOperatorCapability(request: Request): boolean {
  const supplied = request.headers.get(OPERATOR_CAPABILITY_HEADER);
  const expectedHex = process.env.FINALTAB_V3_NARRATION_OPERATOR_TOKEN_SHA256?.trim().toLocaleLowerCase("en-US");
  if (
    typeof supplied !== "string"
    || supplied.length < 20
    || supplied.length > 512
    || typeof expectedHex !== "string"
    || !/^[0-9a-f]{64}$/u.test(expectedHex)
  ) return false;
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const expectedDigest = Buffer.from(expectedHex, "hex");
  return expectedDigest.length === suppliedDigest.length && timingSafeEqual(expectedDigest, suppliedDigest);
}

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeApiRequest(request, {
    scope: "settlements:prepare",
    maxBytes: MAX_BODY_BYTES,
    rateLimit: 5,
    rateWindowMs: 60_000,
    requireSameOriginForSession: false,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => {
    response.headers.set("cache-control", "private, no-store");
    return withAccessHeaders(response, access.headers);
  };

  // This temporary operator is intentionally narrower than ordinary API auth:
  // neither a cookie session nor a Supabase JWT may reach the provider key.
  if (access.principal.source !== "bearer-token") {
    return secured(Response.json({ error: "BEARER_TOKEN_REQUIRED" }, { status: 403 }));
  }
  // A second, operation-specific capability prevents any other legitimate
  // settlements:prepare bearer from consuming or locking this global one-shot.
  // Only its SHA-256 digest exists in Vercel; the raw value stays with the
  // local runner and is checked before provider configuration or journal I/O.
  if (!hasDedicatedOperatorCapability(request)) {
    return secured(Response.json({ error: "NARRATION_OPERATOR_CAPABILITY_REQUIRED" }, { status: 403 }));
  }

  let mode: "preflight" | "generate";
  try {
    mode = BodySchema.parse(await readJsonBodyWithLimit(request, MAX_BODY_BYTES)).mode;
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) {
      return secured(Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes: error.maxBytes }, { status: 413 }));
    }
    return secured(Response.json({ error: "INVALID_OPERATOR_REQUEST" }, { status: 400 }));
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return secured(Response.json({ error: "OPERATOR_NOT_CONFIGURED" }, { status: 503 }));

  const result = await runV3NarrationOperator({
    mode,
    actorSubject: access.principal.subject,
    apiKey,
    store: createV3NarrationGenerationStore(),
  });

  if (!result.ok) {
    return secured(Response.json(
      {
        error: result.code,
        ...(result.facts ? { quota: result.facts } : {}),
      },
      { status: result.status },
    ));
  }
  if (result.kind === "preflight") {
    return secured(Response.json({ ok: true, quota: result.facts }, { status: 200 }));
  }

  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-type": "audio/mpeg",
    "content-length": String(result.audio.length),
    "x-finaltab-narration-audio-sha256": result.audioSha256,
    "x-finaltab-narration-script-sha256": V3_NARRATION_SCRIPT_SHA256,
    "x-finaltab-narration-replayed": String(result.replayed),
    "x-finaltab-provider-posts-this-request": result.replayed ? "0" : "1",
  });
  if (result.providerRequestId) headers.set("x-finaltab-provider-request-id", result.providerRequestId);
  if (result.quotaFacts) {
    headers.set("x-finaltab-quota-checked-at", result.quotaFacts.checkedAt);
    headers.set("x-finaltab-quota-exact-characters", String(V3_NARRATION_EXACT_CHARACTERS));
    headers.set("x-finaltab-quota-required-included-characters", String(V3_NARRATION_REQUIRED_INCLUDED_CHARACTERS));
    headers.set("x-finaltab-quota-remaining-included-characters", String(result.quotaFacts.remainingIncludedCharacters));
  }
  return secured(new Response(new Uint8Array(result.audio), { status: 200, headers }));
}
