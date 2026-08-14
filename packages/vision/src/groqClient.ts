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
  /** Hard provider-side completion cap. Defaults to 4096 and cannot exceed 8192. */
  maxCompletionTokens?: number;
}

export interface GroqTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface GroqCompletionResult {
  content: string;
  model: string;
  usage: GroqTokenUsage;
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
  private readonly maxCompletionTokens: number;

  constructor(opts: GroqClientOptions) {
    if (!opts.apiKey) throw new Error("GroqClient requires an apiKey (GROQ_API_KEY)");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
    this.model = opts.model ?? DEFAULT_GROQ_MODEL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 60000;
    const requestedCompletionTokens = opts.maxCompletionTokens ?? 4096;
    if (!Number.isFinite(requestedCompletionTokens)) throw new Error("maxCompletionTokens must be finite");
    this.maxCompletionTokens = Math.max(256, Math.min(8192, Math.trunc(requestedCompletionTokens)));
  }

  /**
   * Runs a chat completion and returns the assistant text.
   * response_format json_object + temperature 0 for deterministic-ish JSON.
   */
  async completeJson(messages: GroqMessage[]): Promise<string> {
    return (await this.completeJsonWithMetadata(messages)).content;
  }

  /**
   * Same completion contract with the provider-reported model and token usage.
   * Callers that persist AI runs should use this method instead of estimating
   * tokens from characters. Missing provider fields remain absent rather than
   * being invented.
   */
  async completeJsonWithMetadata(messages: GroqMessage[]): Promise<GroqCompletionResult> {
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
          max_completion_tokens: this.maxCompletionTokens,
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
      const detail = groqErrorDetail(body);
      throw new GroqApiError(
        `Groq API error HTTP ${res.status}${detail ? ` — ${detail}` : ""}`,
        res.status,
        body,
      );
    }
    const parsed = body as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: unknown;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    };
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new GroqApiError("Groq API returned no assistant content", res.status, body);
    }
    const safeTokenCount = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    const usage: GroqTokenUsage = {
      promptTokens: safeTokenCount(parsed.usage?.prompt_tokens),
      completionTokens: safeTokenCount(parsed.usage?.completion_tokens),
      totalTokens: safeTokenCount(parsed.usage?.total_tokens),
    };
    return {
      content,
      model: typeof parsed.model === "string" && parsed.model.length > 0 ? parsed.model : this.model,
      usage: Object.fromEntries(Object.entries(usage).filter(([, value]) => value !== undefined)),
    };
  }
}

/** Pulls the human-readable error code/message out of a Groq error body. */
function groqErrorDetail(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const err = (body as { error?: { message?: unknown; code?: unknown } }).error;
  if (typeof err !== "object" || err === null) return null;
  const parts: string[] = [];
  if (typeof err.code === "string" && err.code.length > 0) parts.push(err.code);
  if (typeof err.message === "string" && err.message.length > 0) parts.push(err.message.slice(0, 300));
  return parts.length > 0 ? parts.join(": ") : null;
}

/**
 * True for Groq failures worth one immediate retry: 400 json_validate_failed
 * (model emitted invalid JSON under json_object mode), timeouts, and transient
 * 5xx. A 429 needs the provider's cooldown, so retrying it inside the same
 * request only burns latency and repeats the rejection.
 */
export function isRetryableGroqError(e: unknown): boolean {
  if (!(e instanceof GroqApiError)) return false;
  if (e.httpStatus === 401 || e.httpStatus === 403) return false;
  return e.httpStatus === 400 || e.httpStatus === 408 || e.httpStatus >= 500;
}

/**
 * Strips accidental markdown fences and extracts the first JSON object.
 * Models occasionally wrap output despite instructions; this never invents
 * data, it only unwraps.
 */
export function extractJsonObject(raw: string): unknown {
  // The opening fence is anchored, so it is attempted from one position and
  // scans once. A trailing `\s*```$` is not anchored: the engine retries from
  // every position inside a whitespace run, which is quadratic in the length
  // of the model's output. The closing fence is therefore removed by
  // comparison instead, which strips exactly the same characters.
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, "");
  const trimmed = unfenced.endsWith("```") ? unfenced.slice(0, -3).trimEnd() : unfenced;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model output contains no JSON object");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}
