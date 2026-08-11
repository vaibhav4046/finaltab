import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAssemblyStreamingSession,
  streamElevenLabsSpeech,
  VoiceProviderError,
  VoiceSpeechBodySchema,
  voiceCapabilitySnapshot,
  voiceInternals,
} from "@/lib/server/voice";
import { VOICE_STT_RESERVATION_SECONDS } from "@/lib/server/voiceQuota";

const KEYS = ["ASSEMBLYAI_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"] as const;
const before = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of KEYS) {
    const value = before[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("AssemblyAI temporary streaming sessions", () => {
  it("mints a bounded token server-side and returns an EU, token-free model configuration", async () => {
    const permanentKey = "assembly-test-key-never-returned";
    const temporaryToken = "temporary-browser-token-long-enough";
    process.env.ASSEMBLYAI_API_KEY = permanentKey;
    const fetchMock = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return Response.json({
        token: temporaryToken,
        expires_in_seconds: 60,
      });
    });

    const session = await createAssemblyStreamingSession(fetchMock);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0]!;
    const tokenUrl = new URL(String(input));
    expect(`${tokenUrl.origin}${tokenUrl.pathname}`).toBe(voiceInternals.assemblyTokenEndpoint);
    expect(tokenUrl.searchParams.get("expires_in_seconds")).toBe("60");
    expect(tokenUrl.searchParams.get("max_session_duration_seconds")).toBe("180");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe(permanentKey);
    expect(new Headers(init?.headers).get("authorization")).not.toContain("Bearer");

    const websocketUrl = new URL(session.websocketUrl);
    expect(websocketUrl.origin).toBe("wss://streaming.eu.assemblyai.com");
    expect(websocketUrl.searchParams.get("speech_model")).toBe("universal-3-5-pro");
    expect(websocketUrl.searchParams.get("mode")).toBe("balanced");
    expect(websocketUrl.searchParams.get("language_detection")).toBe("true");
    expect(websocketUrl.searchParams.get("language_codes")).toBeNull();
    expect(websocketUrl.searchParams.get("voice_focus")).toBe("far-field");
    expect(JSON.parse(websocketUrl.searchParams.get("keyterms_prompt") ?? "[]")).toEqual(
      expect.arrayContaining(["FINALTab", "KeeperHub", "EIP-3009", "USDC"]),
    );
    expect(session).toMatchObject({
      token: temporaryToken,
      expiresInSeconds: 60,
      maxSessionDurationSeconds: 180,
      sampleRate: 16_000,
      encoding: "pcm_s16le",
      languageDetection: true,
    });
    expect(JSON.stringify(session)).not.toContain(permanentKey);
    expect(session.websocketUrl).not.toContain(temporaryToken);
    expect(session.maxSessionDurationSeconds).toBe(VOICE_STT_RESERVATION_SECONDS);
  });

  it("fails closed on missing configuration and malformed provider data", async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    await expect(createAssemblyStreamingSession(vi.fn())).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
      httpStatus: 501,
    });

    process.env.ASSEMBLYAI_API_KEY = "configured-for-test";
    await expect(createAssemblyStreamingSession(vi.fn(async () => Response.json({ token: "short" })))).rejects
      .toBeInstanceOf(VoiceProviderError);
  });
});

describe("ElevenLabs low-latency readback", () => {
  it("streams Flash v2.5 MP3 through the server without returning the permanent key", async () => {
    const permanentKey = "eleven-test-key-never-returned";
    process.env.ELEVENLABS_API_KEY = permanentKey;
    const audio = new Uint8Array([0x49, 0x44, 0x33]);
    const fetchMock = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return new Response(audio, {
        headers: { "content-type": "audio/mpeg", "content-length": String(audio.byteLength) },
      });
    });

    const response = await streamElevenLabsSpeech("The settlement is ready for review.", fetchMock);

    const [input, init] = fetchMock.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.pathname).toContain(voiceInternals.elevenLabsDefaultVoiceId);
    expect(url.searchParams.get("output_format")).toBe("mp3_44100_128");
    expect(new Headers(init?.headers).get("xi-api-key")).toBe(permanentKey);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      text: "The settlement is ready for review.",
      model_id: "eleven_flash_v2_5",
      apply_text_normalization: "auto",
    });
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(await response.arrayBuffer()).toEqual(audio.buffer);
  });

  it("rejects non-audio upstream responses and invalid voice IDs", async () => {
    process.env.ELEVENLABS_API_KEY = "configured-for-test";
    await expect(streamElevenLabsSpeech("readback", vi.fn(async () => Response.json({ error: "no" })))).rejects
      .toMatchObject({ code: "UPSTREAM_INVALID", httpStatus: 502 });

    process.env.ELEVENLABS_VOICE_ID = "bad/id";
    await expect(streamElevenLabsSpeech("readback", vi.fn())).rejects
      .toMatchObject({ code: "NOT_CONFIGURED", httpStatus: 501 });
  });
});

describe("voice input bounds and capability truth", () => {
  it("accepts useful readback and rejects empty, oversized, or extra-field requests", () => {
    expect(VoiceSpeechBodySchema.parse({ text: "  Settlement prepared.  " }).text).toBe("Settlement prepared.");
    expect(VoiceSpeechBodySchema.safeParse({ text: "" }).success).toBe(false);
    expect(VoiceSpeechBodySchema.safeParse({ text: "x".repeat(601) }).success).toBe(false);
    expect(VoiceSpeechBodySchema.safeParse({ text: "ok", apiKey: "do-not-accept" }).success).toBe(false);
  });

  it("reports each server-side capability independently", () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    process.env.ELEVENLABS_API_KEY = "configured";
    expect(voiceCapabilitySnapshot()).toEqual({ transcription: false, readback: true });
  });
});
