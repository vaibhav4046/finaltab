import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/apiAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/apiAccess")>();
  return { ...actual, authorizeApiRequest: vi.fn() };
});

vi.mock("@/lib/server/voice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/voice")>();
  return {
    ...actual,
    createAssemblyStreamingSession: vi.fn(),
    streamElevenLabsSpeech: vi.fn(),
  };
});

vi.mock("@/lib/server/voiceQuota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/voiceQuota")>();
  return { ...actual, reserveDurableVoiceBudget: vi.fn() };
});

import { POST as createVoiceSession } from "@/app/api/voice/token/route";
import { POST as createVoiceReadback } from "@/app/api/voice/speak/route";
import { authorizeApiRequest } from "@/lib/server/apiAccess";
import type { ApiPrincipal } from "@/lib/server/apiAccess";
import {
  createAssemblyStreamingSession,
  streamElevenLabsSpeech,
  VoiceProviderError,
} from "@/lib/server/voice";
import { reserveDurableVoiceBudget, VoiceQuotaError } from "@/lib/server/voiceQuota";

const principal: ApiPrincipal = {
  subject: "70e7fd4b-2c63-4935-b74f-f45d26f67b17",
  name: "Voice user",
  scopes: new Set(["tabs:read", "receipts:write"]),
  source: "session",
  rateKey: "voice-user-rate-key",
};

const transcriptionQuota = {
  allowed: true,
  reason: "reserved" as const,
  remaining: 6,
  resetsAt: "2026-08-11T06:01:00.000Z",
  retryAt: "2026-08-11T06:01:00.000Z",
  reservationId: "b432f869-822d-4fa5-80ea-e53d37360be4",
  reservedUnits: 180,
  unit: "seconds" as const,
  userDailyRemaining: 540,
  userMonthlyRemaining: 3420,
  projectDailyRemaining: 3420,
  projectMonthlyRemaining: 17820,
  concurrencyRemaining: 0,
  dailyResetsAt: "2026-08-12T00:00:00.000Z",
  monthlyResetsAt: "2026-09-01T00:00:00.000Z",
  durable: true,
};

const readbackQuota = {
  allowed: true,
  reason: "reserved" as const,
  remaining: 18,
  resetsAt: "2026-08-11T06:01:00.000Z",
  retryAt: "2026-08-11T06:01:00.000Z",
  reservationId: "3db54620-b6c5-4355-96be-42f8c726ab82",
  reservedUnits: 20,
  unit: "characters" as const,
  userDailyRemaining: 2380,
  userMonthlyRemaining: 11980,
  projectDailyRemaining: 11980,
  projectMonthlyRemaining: 59980,
  concurrencyRemaining: null,
  dailyResetsAt: "2026-08-12T00:00:00.000Z",
  monthlyResetsAt: "2026-09-01T00:00:00.000Z",
  durable: true,
};

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`https://finaltab.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://finaltab.example" },
    body: JSON.stringify(body),
  });
}

const streamingSession = {
  token: "assembly-temporary-token",
  expiresInSeconds: 60,
  maxSessionDurationSeconds: 180,
  websocketUrl: "wss://streaming.eu.assemblyai.com/v3/ws?speech_model=universal-3-5-pro",
  sampleRate: 16_000,
  encoding: "pcm_s16le",
  model: "universal-3-5-pro",
  mode: "balanced",
  languageDetection: true,
  keyterms: ["FINALTab"],
  voiceFocus: "far-field",
} as const;

/**
 * The browser voice client sends `POST /api/voice/token` with no payload, but the
 * Node server runtime still hands the route a Request carrying a body stream. This
 * reproduces that exact shape so the route can never again reject the real client.
 */
function runtimeStreamTokenRequest(headers: Record<string, string> = {}): Request {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { origin: "https://finaltab.example", accept: "application/json", ...headers },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    }),
    duplex: "half",
  };
  return new Request("https://finaltab.example/api/voice/token", init);
}

describe("paid voice route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizeApiRequest).mockResolvedValue({
      ok: true,
      principal,
      headers: new Headers({ "cache-control": "private, no-store", "x-ratelimit-remaining": "7" }),
    });
  });

  it("rejects a non-Supabase voice principal before minting an AssemblyAI token", async () => {
    vi.mocked(reserveDurableVoiceBudget).mockRejectedValue(new VoiceQuotaError("SESSION_REQUIRED", 403));

    const response = await createVoiceSession(new Request("https://finaltab.example/api/voice/token", {
      method: "POST",
      headers: { origin: "https://finaltab.example" },
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "VOICE_SESSION_REQUIRED" });
    expect(createAssemblyStreamingSession).not.toHaveBeenCalled();
  });

  it("mints a session for the bodyless browser POST the Node runtime hands over as a stream", async () => {
    vi.mocked(reserveDurableVoiceBudget).mockResolvedValue(transcriptionQuota);
    vi.mocked(createAssemblyStreamingSession).mockResolvedValue(streamingSession);

    const response = await createVoiceSession(runtimeStreamTokenRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: streamingSession.token });
    expect(createAssemblyStreamingSession).toHaveBeenCalledTimes(1);
  });

  it("rejects an undeclared chunked payload before reserving any transcription budget", async () => {
    const response = await createVoiceSession(
      runtimeStreamTokenRequest({ "transfer-encoding": "chunked" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "BODY_NOT_ALLOWED" });
    expect(reserveDurableVoiceBudget).not.toHaveBeenCalled();
    expect(createAssemblyStreamingSession).not.toHaveBeenCalled();
  });

  it("enforces the durable readback quota before calling ElevenLabs", async () => {
    vi.mocked(reserveDurableVoiceBudget).mockResolvedValue({
      ...readbackQuota,
      allowed: false,
      reason: "user_daily_budget",
      remaining: 0,
      retryAt: readbackQuota.dailyResetsAt,
      reservationId: null,
      reservedUnits: 0,
      userDailyRemaining: 0,
    });

    const response = await createVoiceReadback(jsonRequest("/api/voice/speak", { text: "Read this back." }));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "VOICE_BUDGET_EXHAUSTED",
      reason: "user_daily_budget",
    });
    expect(response.headers.get("x-voice-ratelimit-remaining")).toBe("0");
    expect(response.headers.get("x-voice-ratelimit-durable")).toBe("true");
    expect(response.headers.get("x-voice-budget-user-day-remaining")).toBe("0");
    expect(response.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(streamElevenLabsSpeech).not.toHaveBeenCalled();
  });

  it("preserves the fixed-minute denial contract", async () => {
    vi.mocked(reserveDurableVoiceBudget).mockResolvedValue({
      ...readbackQuota,
      allowed: false,
      reason: "minute_limit",
      remaining: 0,
      retryAt: readbackQuota.resetsAt,
      reservationId: null,
      reservedUnits: 0,
    });

    const response = await createVoiceReadback(jsonRequest("/api/voice/speak", { text: "Read this back." }));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "VOICE_RATE_LIMITED", reason: "minute_limit" });
    expect(response.headers.get("x-voice-ratelimit-remaining")).toBe("0");
    expect(streamElevenLabsSpeech).not.toHaveBeenCalled();
  });

  it("blocks an overlapping AssemblyAI lease before minting another token", async () => {
    vi.mocked(reserveDurableVoiceBudget).mockResolvedValue({
      ...transcriptionQuota,
      allowed: false,
      reason: "user_concurrency",
      reservationId: null,
      reservedUnits: 0,
      concurrencyRemaining: 0,
      retryAt: "2026-08-11T06:04:00.000Z",
    });

    const response = await createVoiceSession(new Request("https://finaltab.example/api/voice/token", {
      method: "POST",
      headers: { origin: "https://finaltab.example" },
    }));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "VOICE_CONCURRENCY_LIMITED",
      reason: "user_concurrency",
    });
    expect(response.headers.get("x-voice-concurrency-remaining")).toBe("0");
    expect(createAssemblyStreamingSession).not.toHaveBeenCalled();
  });

  it("retains the consumed transcription quota headers when AssemblyAI fails", async () => {
    vi.mocked(reserveDurableVoiceBudget).mockResolvedValue(transcriptionQuota);
    vi.mocked(createAssemblyStreamingSession).mockRejectedValue(
      new VoiceProviderError("UPSTREAM_REJECTED", 502),
    );

    const response = await createVoiceSession(new Request("https://finaltab.example/api/voice/token", {
      method: "POST",
      headers: { origin: "https://finaltab.example" },
    }));

    expect(response.status).toBe(502);
    expect(response.headers.get("x-voice-ratelimit-remaining")).toBe("6");
    expect(response.headers.get("x-voice-ratelimit-reset")).toBe(transcriptionQuota.resetsAt);
    expect(response.headers.get("x-voice-ratelimit-durable")).toBe("true");
    expect(response.headers.get("x-voice-budget-reserved-units")).toBe("180");
    expect(reserveDurableVoiceBudget).toHaveBeenCalledWith(
      principal,
      "transcription",
      180,
    );
  });

  it("returns allowed ElevenLabs audio with both access and durable quota headers", async () => {
    vi.mocked(reserveDurableVoiceBudget).mockResolvedValue(readbackQuota);
    vi.mocked(streamElevenLabsSpeech).mockResolvedValue(new Response(new Uint8Array([0x49, 0x44, 0x33]), {
      headers: { "content-type": "audio/mpeg", "content-length": "3" },
    }));

    const response = await createVoiceReadback(jsonRequest("/api/voice/speak", { text: "Settlement prepared." }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(response.headers.get("x-voice-ratelimit-remaining")).toBe("18");
    expect(response.headers.get("x-voice-ratelimit-durable")).toBe("true");
    expect(response.headers.get("x-voice-budget-unit")).toBe("characters");
    expect(reserveDurableVoiceBudget).toHaveBeenCalledWith(
      principal,
      "readback",
      "Settlement prepared.".length,
    );
    expect(vi.mocked(reserveDurableVoiceBudget).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(streamElevenLabsSpeech).mock.invocationCallOrder[0]!,
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x49, 0x44, 0x33]));
  });

  it("retains the consumed readback quota headers when ElevenLabs fails", async () => {
    vi.mocked(reserveDurableVoiceBudget).mockResolvedValue(readbackQuota);
    vi.mocked(streamElevenLabsSpeech).mockRejectedValue(
      new VoiceProviderError("UPSTREAM_UNAVAILABLE", 502),
    );

    const response = await createVoiceReadback(jsonRequest("/api/voice/speak", { text: "Settlement prepared." }));

    expect(response.status).toBe(502);
    expect(response.headers.get("x-voice-ratelimit-remaining")).toBe("18");
    expect(response.headers.get("x-voice-ratelimit-reset")).toBe(readbackQuota.resetsAt);
    expect(response.headers.get("x-voice-ratelimit-durable")).toBe("true");
  });

  it("fails closed before either paid provider when the atomic budget store is unavailable", async () => {
    vi.mocked(reserveDurableVoiceBudget).mockRejectedValue(
      new VoiceQuotaError("STORE_UNAVAILABLE", 503),
    );

    const [tokenResponse, speakResponse] = await Promise.all([
      createVoiceSession(new Request("https://finaltab.example/api/voice/token", {
        method: "POST",
        headers: { origin: "https://finaltab.example" },
      })),
      createVoiceReadback(jsonRequest("/api/voice/speak", { text: "Settlement prepared." })),
    ]);

    expect(tokenResponse.status).toBe(503);
    expect(speakResponse.status).toBe(503);
    expect(await tokenResponse.json()).toMatchObject({ error: "VOICE_BUDGET_UNAVAILABLE" });
    expect(await speakResponse.json()).toMatchObject({ error: "VOICE_BUDGET_UNAVAILABLE" });
    expect(createAssemblyStreamingSession).not.toHaveBeenCalled();
    expect(streamElevenLabsSpeech).not.toHaveBeenCalled();
  });
});
