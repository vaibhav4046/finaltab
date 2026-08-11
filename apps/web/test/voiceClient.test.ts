import { describe, expect, it } from "vitest";
import {
  buildVoiceWebSocketUrl,
  composeVoiceTranscript,
  parseVoiceSessionTicket,
  validateVoiceBeginMessage,
  voiceChunkSampleCount,
  voiceSessionStopDelayMs,
} from "@/lib/voiceClient";

const ticket = {
  token: "temporary-browser-token-long-enough",
  expiresInSeconds: 60,
  maxSessionDurationSeconds: 600,
  websocketUrl:
    "wss://streaming.eu.assemblyai.com/v3/ws?sample_rate=16000&encoding=pcm_s16le&speech_model=universal-3-5-pro&mode=balanced&language_detection=true&voice_focus=far-field&keyterms_prompt=%5B%22FINALTab%22%2C%22KeeperHub%22%2C%22EIP-3009%22%5D",
  sampleRate: 16000,
  encoding: "pcm_s16le" as const,
  model: "universal-3-5-pro",
  apiVersion: "2026-06",
  mode: "balanced" as const,
  languageDetection: true,
  keyterms: ["FINALTab", "KeeperHub", "EIP-3009"],
};

describe("voice client session boundary", () => {
  it("validates a server-minted temporary session without changing its values", () => {
    expect(parseVoiceSessionTicket(ticket)).toEqual(ticket);
  });

  it("rejects an insecure or substituted WebSocket endpoint", () => {
    expect(() => parseVoiceSessionTicket({ ...ticket, websocketUrl: "ws://example.test/v3/ws" })).toThrow(
      "approved AssemblyAI EU",
    );
    expect(() => parseVoiceSessionTicket({ ...ticket, websocketUrl: "wss://evil.example/v3/ws" })).toThrow(
      "approved AssemblyAI EU",
    );
    expect(() => parseVoiceSessionTicket({ ...ticket, websocketUrl: `${ticket.websocketUrl}&token=preloaded` })).toThrow(
      "approved AssemblyAI EU",
    );
  });

  it("adds only the ephemeral token to the server-owned v3 streaming configuration", () => {
    const url = new URL(buildVoiceWebSocketUrl(ticket));
    expect(url.origin).toBe("wss://streaming.eu.assemblyai.com");
    expect(url.searchParams.get("token")).toBe("temporary-browser-token-long-enough");
    expect(url.searchParams.get("sample_rate")).toBe("16000");
    expect(url.searchParams.get("encoding")).toBe("pcm_s16le");
    expect(url.searchParams.get("speech_model")).toBe("universal-3-5-pro");
    expect(url.searchParams.get("mode")).toBe("balanced");
    expect(url.searchParams.get("language_detection")).toBe("true");
    expect(url.searchParams.get("voice_focus")).toBe("far-field");
    expect(JSON.parse(url.searchParams.get("keyterms_prompt") ?? "[]")).toEqual(ticket.keyterms);
  });

  it("prints finalized turns in order and keeps the current partial last", () => {
    const turns = new Map([
      [2, "shared the naan."],
      [0, "Vee had the daal,"],
      [1, "Hem and Ravi"],
    ]);
    expect(composeVoiceTranscript(turns, "Ravi had dessert")).toBe(
      "Vee had the daal, Hem and Ravi shared the naan. Ravi had dessert",
    );
  });

  it("accepts only a Begin frame whose applied configuration matches the ticket", () => {
    const begin = {
      type: "Begin",
      id: "session-123",
      configuration: {
        speech_model: ticket.model,
        mode: ticket.mode,
        sample_rate: ticket.sampleRate,
        encoding: ticket.encoding,
        api_version: ticket.apiVersion,
      },
    };
    expect(validateVoiceBeginMessage(begin, ticket)).toEqual({
      id: "session-123",
      configuration: {
        speechModel: ticket.model,
        mode: ticket.mode,
        sampleRate: 16_000,
        encoding: ticket.encoding,
        apiVersion: ticket.apiVersion,
      },
    });
    expect(validateVoiceBeginMessage({
      ...begin,
      configuration: { ...begin.configuration, encoding: undefined },
    }, ticket).configuration.encoding).toBeNull();
  });

  it.each([
    ["speech_model", "different-model", "speech model"],
    ["mode", "max_accuracy", "streaming mode"],
    ["sample_rate", 48_000, "sample rate"],
    ["encoding", "pcm_mulaw", "audio encoding"],
    ["api_version", "different-version", "streaming API version"],
  ])("fails closed when Begin.configuration.%s differs", (field, value, message) => {
    expect(() => validateVoiceBeginMessage({
      type: "Begin",
      id: "session-123",
      configuration: {
        speech_model: ticket.model,
        mode: ticket.mode,
        sample_rate: ticket.sampleRate,
        encoding: ticket.encoding,
        api_version: ticket.apiVersion,
        [field]: value,
      },
    }, ticket)).toThrow(message);
  });

  it("keeps audio frames at exactly 50 ms and schedules shutdown before the provider cap", () => {
    expect(voiceChunkSampleCount(16_000)).toBe(800);
    expect(voiceChunkSampleCount(48_000)).toBe(2_400);
    expect(voiceSessionStopDelayMs(600)).toBe(585_000);
  });
});
