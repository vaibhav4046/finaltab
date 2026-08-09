/**
 * Minimal Groq chat-completions client (OpenAI-compatible endpoint).
 * Server-side only — the API key must never reach a browser bundle.
 */

export interface GroqMessageContentText {
  type: "text";
  text: string;
}

export interface GroqMessageContentImage {
  type: "image_url";
  image_url: { url: string };
}

export type GroqUserContent = string | Array<GroqMessageContentText | GroqMessageContentImage>;

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: GroqUserContent;
}

export interface GroqClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

export class GroqApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "GroqApiError";
  }
}

export const DEFAULT_GROQ_MODEL = "qwen/qwen3.6-27b";

export class GroqClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: GroqClientOptions) {
    if (!opts.apiKey) throw new Error("GroqClient requires an apiKey (GROQ_API_KEY)");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
    this.model = opts.model ?? DEFAULT_GROQ_MODEL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 60000;
  }

  /**
   * Runs a chat completion and returns the assistant text.
   * response_format json_object + temperature 0 for deterministic-ish JSON.
   */
  async completeJson(messages: GroqMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      throw new GroqApiError(`Groq API error HTTP ${res.status}`, res.status, body);
    }
    const content = (body as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
      ?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new GroqApiError("Groq API returned no assistant content", res.status, body);
    }
    return content;
  }
}

/**
 * Strips accidental markdown fences and extracts the first JSON object.
 * Models occasionally wrap output despite instructions; this never invents
 * data, it only unwraps.
 */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model output contains no JSON object");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}
