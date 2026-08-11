import { authorizeApiRequest, withAccessHeaders } from "@/lib/server/apiAccess";
import { createAssemblyStreamingSession, VoiceProviderError } from "@/lib/server/voice";

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

  try {
    const session = await createAssemblyStreamingSession();
    return secured(Response.json(session, {
      headers: {
        "cache-control": "private, no-store",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      },
    }));
  } catch (error) {
    if (error instanceof VoiceProviderError) {
      const message = error.code === "NOT_CONFIGURED"
        ? "AssemblyAI transcription is not configured on the server."
        : "AssemblyAI could not start a transcription session.";
      return secured(Response.json({ error: error.code, message }, { status: error.httpStatus }));
    }
    return secured(Response.json(
      { error: "UPSTREAM_UNAVAILABLE", message: "AssemblyAI could not start a transcription session." },
      { status: 502 },
    ));
  }
}
