import { VOICE_STT_RESERVATION_SECONDS } from "@/lib/voicePolicy";

export interface VoiceSessionTicket {
  token: string;
  expiresInSeconds: number;
  maxSessionDurationSeconds: number;
  websocketUrl: string;
  sampleRate: number;
  encoding: "pcm_s16le";
  model: string;
  mode: "min_latency" | "balanced" | "max_accuracy";
  languageDetection: boolean;
  keyterms: string[];
  voiceFocus: "near-field" | "far-field";
}

export interface ValidatedVoiceBegin {
  id: string;
  expiresAt: number;
}

export const VOICE_CHUNK_MILLISECONDS = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Voice service returned an invalid ${field}.`);
  }
  return value.trim();
}

export function parseVoiceSessionTicket(value: unknown): VoiceSessionTicket {
  if (!isRecord(value)) throw new Error("Voice service returned an invalid session response.");

  const token = requiredString(value.token, "temporary token");
  const websocketUrl = requiredString(value.websocketUrl, "WebSocket URL");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(websocketUrl);
  } catch {
    throw new Error("Voice service returned an invalid WebSocket URL.");
  }
  if (
    parsedUrl.protocol !== "wss:" ||
    parsedUrl.hostname !== "streaming.eu.assemblyai.com" ||
    parsedUrl.pathname !== "/v3/ws" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.searchParams.has("token")
  ) {
    throw new Error("Voice service requires the approved AssemblyAI EU WebSocket endpoint.");
  }

  const expiresInSeconds = value.expiresInSeconds;
  const maxSessionDurationSeconds = value.maxSessionDurationSeconds;
  const sampleRate = value.sampleRate;
  const encoding = value.encoding;
  const mode = value.mode;
  const languageDetection = value.languageDetection;
  const rawKeyterms = value.keyterms;
  const voiceFocus = value.voiceFocus;

  if (token.length < 20 || token.length > 8_192) {
    throw new Error("Voice service returned an invalid temporary token.");
  }
  if (!Number.isInteger(expiresInSeconds) || Number(expiresInSeconds) < 1 || Number(expiresInSeconds) > 600) {
    throw new Error("Voice service returned an invalid token lifetime.");
  }
  if (
    !Number.isInteger(maxSessionDurationSeconds) ||
    Number(maxSessionDurationSeconds) !== VOICE_STT_RESERVATION_SECONDS
  ) {
    throw new Error("Voice service returned an invalid maximum session duration.");
  }
  if (!Number.isInteger(sampleRate) || Number(sampleRate) < 8_000 || Number(sampleRate) > 96_000) {
    throw new Error("Voice service returned an invalid audio sample rate.");
  }
  if (encoding !== "pcm_s16le") throw new Error("Voice service returned an unsupported audio encoding.");
  if (mode !== "min_latency" && mode !== "balanced" && mode !== "max_accuracy") {
    throw new Error("Voice service returned an unsupported streaming mode.");
  }
  if (typeof languageDetection !== "boolean") {
    throw new Error("Voice service returned an invalid language setting.");
  }
  if (voiceFocus !== "near-field" && voiceFocus !== "far-field") {
    throw new Error("Voice service returned an unsupported Voice Focus mode.");
  }
  if (
    !Array.isArray(rawKeyterms) ||
    rawKeyterms.length > 100 ||
    rawKeyterms.some((term) => typeof term !== "string" || term.trim().length === 0 || term.length > 50)
  ) {
    throw new Error("Voice service returned invalid recognition keyterms.");
  }

  const model = requiredString(value.model, "speech model");
  const keyterms = rawKeyterms.map((term) => term.trim()).filter(Boolean).slice(0, 100);
  let configuredKeyterms: unknown;
  try {
    configuredKeyterms = JSON.parse(parsedUrl.searchParams.get("keyterms_prompt") ?? "null");
  } catch {
    throw new Error("Voice service returned an invalid keyterms configuration.");
  }
  if (
    parsedUrl.searchParams.get("sample_rate") !== String(sampleRate) ||
    parsedUrl.searchParams.get("encoding") !== encoding ||
    parsedUrl.searchParams.get("speech_model") !== model ||
    parsedUrl.searchParams.get("mode") !== mode ||
    parsedUrl.searchParams.get("language_detection") !== String(languageDetection) ||
    parsedUrl.searchParams.get("voice_focus") !== voiceFocus ||
    parsedUrl.searchParams.get("include_partial_turns") !== "true" ||
    !Array.isArray(configuredKeyterms) ||
    configuredKeyterms.length !== keyterms.length ||
    configuredKeyterms.some((term, index) => term !== keyterms[index]) ||
    !(parsedUrl.searchParams.get("prompt")?.trim())
  ) {
    throw new Error("Voice service returned streaming settings that do not match its signed session ticket.");
  }

  return {
    token,
    expiresInSeconds: Number(expiresInSeconds),
    maxSessionDurationSeconds: Number(maxSessionDurationSeconds),
    websocketUrl,
    sampleRate: Number(sampleRate),
    encoding,
    model,
    mode,
    languageDetection,
    keyterms,
    voiceFocus,
  };
}

export function validateVoiceBeginMessage(value: unknown): ValidatedVoiceBegin {
  if (!isRecord(value) || value.type !== "Begin") {
    throw new Error("Live transcription did not begin with an AssemblyAI Begin frame.");
  }
  const id = requiredString(value.id, "streaming session ID");
  if (id.length > 512) {
    throw new Error("Voice service returned an invalid streaming session ID.");
  }
  const expiresAt = value.expires_at;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new Error("AssemblyAI Begin returned an invalid session expiry.");
  }

  // AssemblyAI's documented Begin event contains only the session identity and
  // expiry. Model, region, audio, mode, prompt, keyterms and Voice Focus remain
  // pinned by parseVoiceSessionTicket against the server-owned WebSocket URL.
  return { id, expiresAt };
}

export function voiceChunkSampleCount(sampleRate: number): number {
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) {
    throw new Error("Voice chunk sample rate is outside the supported range.");
  }
  return Math.round(sampleRate * VOICE_CHUNK_MILLISECONDS / 1_000);
}

export function voiceSessionStopDelayMs(maxSessionDurationSeconds: number): number {
  if (!Number.isFinite(maxSessionDurationSeconds) || maxSessionDurationSeconds < 1) return 1_000;
  const safetyMarginSeconds = Math.min(15, Math.max(5, Math.floor(maxSessionDurationSeconds / 10)));
  return Math.max(1_000, (maxSessionDurationSeconds - safetyMarginSeconds) * 1_000);
}

export function buildVoiceWebSocketUrl(ticket: VoiceSessionTicket): string {
  const url = new URL(ticket.websocketUrl);
  // The server owns the model, region, prompting, keyterms and audio policy.
  // The browser adds only the short-lived, single-use redemption credential.
  url.searchParams.set("token", ticket.token);
  return url.toString();
}

export function composeVoiceTranscript(finalTurns: ReadonlyMap<number, string>, partial = ""): string {
  const completed = Array.from(finalTurns.entries())
    .sort(([left], [right]) => left - right)
    .map(([, text]) => text.trim())
    .filter(Boolean);
  const live = partial.trim();
  return [...completed, ...(live ? [live] : [])].join(" ").trim();
}
