import { z } from "zod";
import { extractReceiptWithFallback, analyzeImageQuality } from "@finaltab/vision";
import { checkReceiptArithmetic } from "@finaltab/engine";
import { jsonError } from "@/lib/server/clients";
import { ApiPayloadTooLargeError, authorizeApiRequest, readJsonBodyWithLimit, withAccessHeaders } from "@/lib/server/apiAccess";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  imageDataUrl: z.string().regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "must be an image data URL"),
});

export async function POST(req: Request): Promise<Response> {
  const access = await authorizeApiRequest(req, {
    scope: "receipts:write",
    maxBytes: 14_500_000,
    rateLimit: 10,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await readJsonBodyWithLimit(req, 14_500_000));
  } catch (e) {
    if (e instanceof ApiPayloadTooLargeError) {
      return secured(Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes: e.maxBytes }, { status: 413 }));
    }
    return secured(jsonError(e instanceof Error ? e.message : "invalid request body", 400));
  }

  // analyzeImageQuality is an unimplemented no-op that always returns PASS, so
  // qualityWarning is always null today and the branches below are unreachable.
  // Kept as the wiring point for real server-side analysis; the sharpness check
  // that actually runs is client-side, before upload, in lib/imageOptimization.ts.
  let qualityWarning: string | null = null;
  try {
    const base64 = body.imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64, "base64");
    const quality = await analyzeImageQuality(imageBuffer, "image/png");
    if (quality.recommendation === "WARN_BLURRY") {
      qualityWarning = "WARN_BLURRY";
    } else if (quality.recommendation === "WARN_UNDEREXPOSED") {
      qualityWarning = "WARN_UNDEREXPOSED";
    }
  } catch (e) {
    // Quality check errors are non-fatal; continue with extraction
    console.error("[vision] quality check failed:", e instanceof Error ? e.message : String(e));
  }

  try {
    const apiKeys = {
      groqApiKey: process.env.GROQ_API_KEY,
      claudeApiKey: process.env.CLAUDE_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
    };

    if (!apiKeys.groqApiKey && !apiKeys.claudeApiKey && !apiKeys.openaiApiKey) {
      return secured(jsonError("No LLM API keys configured on the server.", 501));
    }

    const { receipt, attempts, provider } = await extractReceiptWithFallback(body.imageDataUrl, apiKeys);
    const arithmeticIssues = checkReceiptArithmetic(receipt).map((i) => `${i.code}: ${i.message}`);
    return secured(Response.json({ receipt, attempts, provider, qualityWarning, arithmeticIssues }));
  } catch (e) {
    return secured(jsonError(e instanceof Error ? e.message : "extraction failed", 502));
  }
}
