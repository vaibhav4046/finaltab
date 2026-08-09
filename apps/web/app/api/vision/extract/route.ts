import { z } from "zod";
import { parseReceiptImage } from "@finaltab/vision";
import { checkReceiptArithmetic } from "@finaltab/engine";
import { groqClient, jsonError } from "@/lib/server/clients";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  imageDataUrl: z.string().regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "must be an image data URL"),
});

export async function POST(req: Request): Promise<Response> {
  const client = groqClient();
  if (!client) return jsonError("GROQ_API_KEY is not configured on the server.", 501);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "invalid request body", 400);
  }

  try {
    const { receipt, attempts } = await parseReceiptImage(client, body.imageDataUrl);
    const arithmeticIssues = checkReceiptArithmetic(receipt).map((i) => `${i.code}: ${i.message}`);
    return Response.json({ receipt, attempts, arithmeticIssues });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "extraction failed", 502);
  }
}
