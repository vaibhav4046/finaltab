export interface VoiceSessionTicket {
  token: string;
  expiresInSeconds: number;
  maxSessionDurationSeconds: number;
  websocketUrl: string;
  sampleRate: number;
  encoding: "pcm_s16le";
  model: string;
  apiVersion: string;
  mode: "min_latency" | "balanced" | "max_accuracy";
  languageDetection: boolean;
  keyterms: string[];
}

export interface ValidatedVoiceBegin {
  id: string;
  configuration: {
    speechModel: string;
    mode: VoiceSessionTicket["mode"];
    sampleRate: number;
    encoding: VoiceSessionTicket["encoding"] | null;
    apiVersion: string;
  };
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

  if (token.length < 20 || token.length > 8_192) {
    throw new Error("Voice service returned an invalid temporary token.");
  }
  if (!Number.isInteger(expiresInSeconds) || Number(expiresInSeconds) < 1 || Number(expiresInSeconds) > 600) {
    throw new Error("Voice service returned an invalid token lifetime.");
  }
  if (
    !Number.isInteger(maxSessionDurationSeconds) ||
    Number(maxSessionDurationSeconds) < 60 ||
    Number(maxSessionDurationSeconds) > 10_800
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
  if (
    !Array.isArray(rawKeyterms) ||
    rawKeyterms.length > 100 ||
    rawKeyterms.some((term) => typeof term !== "string" || term.trim().length === 0 || term.length > 50)
  ) {
    throw new Error("Voice service returned invalid recognition keyterms.");
  }

  return {
    token,
    expiresInSeconds: Number(expiresInSeconds),
    maxSessionDurationSeconds: Number(maxSessionDurationSeconds),
    websocketUrl,
    sampleRate: Number(sampleRate),
    encoding,
    model: requiredString(value.model, "speech model"),
    apiVersion: requiredString(value.apiVersion, "streaming API version"),
    mode,
    languageDetection,
    keyterms: rawKeyterms.map((term) => term.trim()).filter(Boolean).slice(0, 100),
  };
}

export function validateVoiceBeginMessage(value: unknown, ticket: VoiceSessionTicket): ValidatedVoiceBegin {
  if (!isRecord(value) || value.type !== "Begin") {
    throw new Error("Live transcription did not begin with an AssemblyAI Begin frame.");
  }
  const id = requiredString(value.id, "streaming session ID");
  if (!isRecord(value.configuration)) {
    throw new Error("AssemblyAI Begin did not include its applied configuration.");
  }

  const configuration = value.configuration;
  const speechModel = requiredString(configuration.speech_model, "applied speech model");
  const mode = requiredString(configuration.mode, "applied streaming mode");
  const apiVersion = requiredString(configuration.api_version, "applied streaming API version");
  const sampleRate = configuration.sample_rate;
  const encoding = configuration.encoding;

  if (speechModel !== ticket.model) {
    throw new Error("AssemblyAI applied a different speech model than the server approved.");
  }
  if (mode !== ticket.mode) {
    throw new Error("AssemblyAI applied a different streaming mode than the server approved.");
  }
  if (!Number.isInteger(sampleRate) || Number(sampleRate) !== ticket.sampleRate) {
    throw new Error("AssemblyAI applied a different audio sample rate than the server approved.");
  }
  if (encoding !== undefined && encoding !== null && encoding !== ticket.encoding) {
    throw new Error("AssemblyAI applied a different audio encoding than the server approved.");
  }
  if (apiVersion !== ticket.apiVersion) {
    throw new Error("AssemblyAI applied a different streaming API version than the server approved.");
  }

  return {
    id,
    configuration: {
      speechModel,
      mode: ticket.mode,
      sampleRate: Number(sampleRate),
      encoding: encoding === ticket.encoding ? encoding : null,
      apiVersion,
    },
  };
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
