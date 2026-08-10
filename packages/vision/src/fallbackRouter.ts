/**
 * Fallback LLM routing: Groq → Claude → OpenAI.
 * Tries each provider in sequence until one succeeds.
 * Transparent to caller — all three return receipt in identical format.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ParsedReceiptSchema, type ParsedReceipt } from "@finaltab/engine";
import { GroqClient, extractJsonObject, isRetryableGroqError } from "./groqClient.js";
import { RECEIPT_EXTRACTION_SYSTEM } from "./prompts.js";

export interface ExtractReceiptResult {
  receipt: ParsedReceipt;
  rawModelOutput: string;
  attempts: number;
  provider: "groq" | "claude" | "openai";
}

const MAX_ATTEMPTS = 3;

/**
 * Extract receipt with fallback routing (Groq → Claude → OpenAI).
 * Returns immediately on success. Throws only if all providers fail.
 * All errors are caught and logged server-side; client never sees which provider was attempted.
 */
export async function extractReceiptWithFallback(
  imageDataUrl: string,
  options: {
    groqApiKey?: string;
    claudeApiKey?: string;
    openaiApiKey?: string;
  }
): Promise<ExtractReceiptResult> {
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(imageDataUrl)) {
    throw new Error("imageDataUrl must be a base64 data URL of type png/jpeg/webp");
  }

  let lastError: Error | null = null;

  // Try Groq
  if (options.groqApiKey) {
    try {
      const result = await extractViaGroq(imageDataUrl, options.groqApiKey);
      console.log("[vision] receipt extracted via Groq");
      return { ...result, provider: "groq" };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error("[vision] Groq failed, fallback to Claude:", lastError.message.slice(0, 100));
    }
  }

  // Try Claude
  if (options.claudeApiKey) {
    try {
      const result = await extractViaClaude(imageDataUrl, options.claudeApiKey);
      console.log("[vision] receipt extracted via Claude");
      return { ...result, provider: "claude" };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error("[vision] Claude failed, fallback to OpenAI:", lastError.message.slice(0, 100));
    }
  }

  // Try OpenAI
  if (options.openaiApiKey) {
    try {
      const result = await extractViaOpenAI(imageDataUrl, options.openaiApiKey);
      console.log("[vision] receipt extracted via OpenAI");
      return { ...result, provider: "openai" };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error("[vision] OpenAI failed:", lastError.message.slice(0, 100));
    }
  }

  throw new Error(
    `Receipt extraction failed on all providers. Last error: ${lastError?.message || "no keys configured"}`
  );
}

async function extractViaGroq(
  imageDataUrl: string,
  apiKey: string
): Promise<Omit<ExtractReceiptResult, "provider">> {
  const client = new GroqClient({ apiKey });
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages = [
      { role: "system" as const, content: RECEIPT_EXTRACTION_SYSTEM },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: "Extract this receipt to the JSON schema. Raw JSON only." },
          { type: "image_url" as const, image_url: { url: imageDataUrl } },
        ],
      },
    ];
    if (attempt > 1 && lastError instanceof Error) {
      messages.push({
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: `Your previous output was invalid: ${lastError.message}. Output ONLY the corrected JSON object.`,
          },
        ],
      } as any);
    }

    let raw: string;
    try {
      raw = await client.completeJson(messages);
    } catch (e) {
      if (attempt < MAX_ATTEMPTS && isRetryableGroqError(e)) {
        lastError = e;
        continue;
      }
      throw e;
    }

    try {
      const parsed = ParsedReceiptSchema.parse(extractJsonObject(raw));
      return { receipt: parsed, rawModelOutput: raw, attempts: attempt };
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(
    `Groq extraction failed after ${MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function extractViaClaude(
  imageDataUrl: string,
  apiKey: string
): Promise<Omit<ExtractReceiptResult, "provider">> {
  const client = new Anthropic({ apiKey });
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const mediaType = imageDataUrl.includes("jpeg") || imageDataUrl.includes("jpg") ? "image/jpeg" : "image/png";

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const systemPrompt = RECEIPT_EXTRACTION_SYSTEM;
    let userText = "Extract this receipt to the JSON schema. Raw JSON only.";
    if (attempt > 1 && lastError instanceof Error) {
      userText = `Your previous output was invalid: ${lastError.message}. Output ONLY the corrected JSON object.`;
    }

    let raw: string;
    try {
      const response = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: userText },
            ],
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Claude returned non-text response");
      }
      raw = content.text;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) continue;
      throw e;
    }

    try {
      const parsed = ParsedReceiptSchema.parse(extractJsonObject(raw));
      return { receipt: parsed, rawModelOutput: raw, attempts: attempt };
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(
    `Claude extraction failed after ${MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function extractViaOpenAI(
  imageDataUrl: string,
  apiKey: string
): Promise<Omit<ExtractReceiptResult, "provider">> {
  const client = new OpenAI({ apiKey });

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let userText = "Extract this receipt to the JSON schema. Raw JSON only.";
    if (attempt > 1 && lastError instanceof Error) {
      userText = `Your previous output was invalid: ${lastError.message}. Output ONLY the corrected JSON object.`;
    }

    let raw: string;
    try {
      const response = await client.chat.completions.create({
        // "gpt-4-vision" was never a served model id. This leg has never run
        // against the live OpenAI API (no key is configured), so the id below is
        // reasoned, not measured — see docs/release/truth-snapshot.md.
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: RECEIPT_EXTRACTION_SYSTEM,
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageDataUrl } },
              { type: "text", text: userText },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("OpenAI returned non-text response");
      }
      raw = content;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) continue;
      throw e;
    }

    try {
      const parsed = ParsedReceiptSchema.parse(extractJsonObject(raw));
      return { receipt: parsed, rawModelOutput: raw, attempts: attempt };
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(
    `OpenAI extraction failed after ${MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}
