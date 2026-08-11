import "server-only";

import { z } from "zod";
import { VOICE_STT_RESERVATION_SECONDS } from "@/lib/voicePolicy";

const ASSEMBLYAI_TOKEN_ENDPOINT = "https://streaming.eu.assemblyai.com/v3/token";
const ASSEMBLYAI_WEBSOCKET_ENDPOINT = "wss://streaming.eu.assemblyai.com/v3/ws";
const ASSEMBLYAI_TOKEN_REDEMPTION_SECONDS = 60;
// Three minutes is enough for a complex receipt instruction while bounding
// worst-case provider usage before the browser receives a temporary token.
const ASSEMBLYAI_MAX_SESSION_SECONDS = VOICE_STT_RESERVATION_SECONDS;
const ASSEMBLYAI_SAMPLE_RATE = 16_000;
const ASSEMBLYAI_ENCODING = "pcm_s16le";
const ASSEMBLYAI_MODEL = "universal-3-5-pro";
const ASSEMBLYAI_API_VERSION = "2025-05-12";
const ASSEMBLYAI_MODE = "balanced";
const ASSEMBLYAI_VOICE_FOCUS = "far-field";
const ASSEMBLYAI_KEYTERMS = [
  "FINALTab",
  "KeeperHub",
  "EIP-3009",
  "USDC",
  "Base Sepolia",
  "ledger hash",
  "settlement consent",
  "cent-perfect",
  "onchain",
] as const;
const ASSEMBLYAI_CONTEXT =
  "A shared-expense allocation conversation about receipt items, participants, exact shares, debts, and human-approved onchain USDC settlement.";

const ELEVENLABS_API_ORIGIN = "https://api.elevenlabs.io";
const ELEVENLABS_DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const ELEVENLABS_MODEL = "eleven_flash_v2_5";
const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";

const TemporaryTokenSchema = z.object({
  token: z.string().trim().min(20).max(8_192),
  expires_in_seconds: z.number().int().min(1).max(600),
});

export const VoiceSpeechBodySchema = z.object({
  text: z.string().trim().min(1).max(600),
}).strict();

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class VoiceProviderError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "UPSTREAM_REJECTED" | "UPSTREAM_INVALID" | "UPSTREAM_UNAVAILABLE",
    readonly httpStatus: number,
  ) {
    super(code);
    this.name = "VoiceProviderError";
  }
}

export interface AssemblyStreamingSession {
  /** Short-lived redemption credential. The permanent API key never leaves the server. */
  token: string;
  expiresInSeconds: number;
  maxSessionDurationSeconds: number;
  /** Fully configured EU WebSocket URL. The browser appends only the temporary token. */
  websocketUrl: string;
  sampleRate: number;
  encoding: typeof ASSEMBLYAI_ENCODING;
  model: typeof ASSEMBLYAI_MODEL;
  apiVersion: typeof ASSEMBLYAI_API_VERSION;
  mode: typeof ASSEMBLYAI_MODE;
  languageDetection: true;
  keyterms: readonly string[];
  voiceFocus: typeof ASSEMBLYAI_VOICE_FOCUS;
}

export function voiceCapabilitySnapshot() {
  return {
    transcription: Boolean(process.env.ASSEMBLYAI_API_KEY?.trim()),
    readback: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
  } as const;
}

function assemblyWebsocketUrl(): string {
  const url = new URL(ASSEMBLYAI_WEBSOCKET_ENDPOINT);
  url.searchParams.set("sample_rate", String(ASSEMBLYAI_SAMPLE_RATE));
  url.searchParams.set("encoding", ASSEMBLYAI_ENCODING);
  url.searchParams.set("speech_model", ASSEMBLYAI_MODEL);
  url.searchParams.set("mode", ASSEMBLYAI_MODE);
  url.searchParams.set("language_detection", "true");
  // Omit language_codes deliberately: Universal-3.5 Pro then keeps native
  // code switching across every supported language instead of steering.
  url.searchParams.set("voice_focus", ASSEMBLYAI_VOICE_FOCUS);
  url.searchParams.set("prompt", ASSEMBLYAI_CONTEXT);
  url.searchParams.set("keyterms_prompt", JSON.stringify(ASSEMBLYAI_KEYTERMS));
  url.searchParams.set("include_partial_turns", "true");
  return url.toString();
}

async function boundedProviderJson(response: Response, maxBytes = 16_384): Promise<unknown> {
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new VoiceProviderError("UPSTREAM_INVALID", 502);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new VoiceProviderError("UPSTREAM_INVALID", 502);
  }
}

/** Mint one short-lived AssemblyAI browser credential through the server. */
export async function createAssemblyStreamingSession(
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<AssemblyStreamingSession> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!apiKey) throw new VoiceProviderError("NOT_CONFIGURED", 501);

  const tokenUrl = new URL(ASSEMBLYAI_TOKEN_ENDPOINT);
  tokenUrl.searchParams.set("expires_in_seconds", String(ASSEMBLYAI_TOKEN_REDEMPTION_SECONDS));
  tokenUrl.searchParams.set("max_session_duration_seconds", String(ASSEMBLYAI_MAX_SESSION_SECONDS));

  let response: Response;
  try {
    response = await fetchImpl(tokenUrl, {
      method: "GET",
      headers: {
        // AssemblyAI requires the raw key here, not a Bearer token.
        Authorization: apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new VoiceProviderError("UPSTREAM_UNAVAILABLE", 502);
  }

  if (!response.ok) {
    throw new VoiceProviderError("UPSTREAM_REJECTED", response.status === 429 ? 503 : 502);
  }

  const parsed = TemporaryTokenSchema.safeParse(await boundedProviderJson(response));
  if (!parsed.success) throw new VoiceProviderError("UPSTREAM_INVALID", 502);

  return {
    token: parsed.data.token,
    expiresInSeconds: parsed.data.expires_in_seconds,
    maxSessionDurationSeconds: ASSEMBLYAI_MAX_SESSION_SECONDS,
    websocketUrl: assemblyWebsocketUrl(),
    sampleRate: ASSEMBLYAI_SAMPLE_RATE,
    encoding: ASSEMBLYAI_ENCODING,
    model: ASSEMBLYAI_MODEL,
    apiVersion: ASSEMBLYAI_API_VERSION,
    mode: ASSEMBLYAI_MODE,
    languageDetection: true,
    keyterms: ASSEMBLYAI_KEYTERMS,
    voiceFocus: ASSEMBLYAI_VOICE_FOCUS,
  };
}

/** Proxy ElevenLabs TTS without buffering inside the route handler. */
export async function streamElevenLabsSpeech(
  text: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new VoiceProviderError("NOT_CONFIGURED", 501);

  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || ELEVENLABS_DEFAULT_VOICE_ID;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(voiceId)) {
    throw new VoiceProviderError("NOT_CONFIGURED", 501);
  }

  const url = new URL(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`, ELEVENLABS_API_ORIGIN);
  url.searchParams.set("output_format", ELEVENLABS_OUTPUT_FORMAT);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        apply_text_normalization: "auto",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new VoiceProviderError("UPSTREAM_UNAVAILABLE", 502);
  }

  if (!response.ok || !response.body) {
    throw new VoiceProviderError("UPSTREAM_REJECTED", response.status === 429 ? 503 : 502);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("audio/")) {
    await response.body.cancel();
    throw new VoiceProviderError("UPSTREAM_INVALID", 502);
  }
  return response;
}

export const voiceInternals = {
  assemblyWebsocketUrl,
  assemblyKeyterms: ASSEMBLYAI_KEYTERMS,
  assemblyTokenEndpoint: ASSEMBLYAI_TOKEN_ENDPOINT,
  assemblyTokenRedemptionSeconds: ASSEMBLYAI_TOKEN_REDEMPTION_SECONDS,
  assemblyMaxSessionSeconds: ASSEMBLYAI_MAX_SESSION_SECONDS,
  elevenLabsDefaultVoiceId: ELEVENLABS_DEFAULT_VOICE_ID,
  elevenLabsModel: ELEVENLABS_MODEL,
  elevenLabsOutputFormat: ELEVENLABS_OUTPUT_FORMAT,
};
