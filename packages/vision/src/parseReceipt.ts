import { ParsedReceiptSchema, type ParsedReceipt } from "@finaltab/engine";
import { GroqClient, extractJsonObject, type GroqMessage } from "./groqClient.js";
import { RECEIPT_EXTRACTION_SYSTEM } from "./prompts.js";

export interface ParseReceiptResult {
  receipt: ParsedReceipt;
  /** Raw model output, kept for the audit trail. */
  rawModelOutput: string;
  attempts: number;
}

const MAX_ATTEMPTS = 2;

/**
 * Sends a receipt image (data URL: data:image/png;base64,...) to the vision
 * model and returns a Zod-validated ParsedReceipt.
 *
 * The model output is a PROPOSAL — callers must run checkReceiptArithmetic()
 * from @finaltab/engine and surface any mismatch to the user before money math
 * proceeds. One retry on invalid JSON/schema, then fail loudly.
 */
export async function parseReceiptImage(client: GroqClient, imageDataUrl: string): Promise<ParseReceiptResult> {
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(imageDataUrl)) {
    throw new Error("imageDataUrl must be a base64 data URL of type png/jpeg/webp");
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages: GroqMessage[] = [
      { role: "system", content: RECEIPT_EXTRACTION_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract this receipt to the JSON schema. Raw JSON only." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ];
    if (attempt > 1 && lastError instanceof Error) {
      messages.push({
        role: "user",
        content: `Your previous output was invalid: ${lastError.message}. Output ONLY the corrected JSON object.`,
      });
    }

    const raw = await client.completeJson(messages);
    try {
      const parsed = ParsedReceiptSchema.parse(extractJsonObject(raw));
      return { receipt: parsed, rawModelOutput: raw, attempts: attempt };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `Receipt extraction failed after ${MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
