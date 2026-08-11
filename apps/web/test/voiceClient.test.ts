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
  maxSessionDurationSeconds: 180,
  websocketUrl:
    "wss://streaming.eu.assemblyai.com/v3/ws?sample_rate=16000&encoding=pcm_s16le&speech_model=universal-3-5-pro&mode=balanced&language_detection=true&voice_focus=far-field&prompt=Shared+expense+allocation&keyterms_prompt=%5B%22FINALTab%22%2C%22KeeperHub%22%2C%22EIP-3009%22%5D&include_partial_turns=true",
  sampleRate: 16000,
  encoding: "pcm_s16le" as const,
  model: "universal-3-5-pro",
  apiVersion: "2026-06",
  mode: "balanced" as const,
  languageDetection: true,
  keyterms: ["FINALTab", "KeeperHub", "EIP-3009"],
  voiceFocus: "far-field" as const,
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
    expect(() => parseVoiceSessionTicket({ ...ticket, maxSessionDurationSeconds: 600 })).toThrow(
      "maximum session duration",
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
      [0, "The first participant had the daal,"],
      [1, "two others"],
    ]);
    expect(composeVoiceTranscript(turns, "the final participant had dessert")).toBe(
      "The first participant had the daal, two others shared the naan. the final participant had dessert",
    );
  });

  it("accepts only a Begin frame whose applied configuration matches the ticket", () => {
    const begin = {
      type: "Begin",
      id: "session-123",
      configuration: {
        model: ticket.model,
        mode: ticket.mode,
        api_version: ticket.apiVersion,
        voice_focus: ticket.voiceFocus,
      },
    };
    expect(validateVoiceBeginMessage(begin, ticket)).toEqual({
      id: "session-123",
      configuration: {
        model: ticket.model,
        mode: ticket.mode,
        apiVersion: ticket.apiVersion,
        voiceFocus: ticket.voiceFocus,
      },
    });
  });

  it.each([
    ["model", "different-model", "speech model"],
    ["mode", "max_accuracy", "streaming mode"],
    ["api_version", "different-version", "streaming API version"],
    ["voice_focus", "near-field", "Voice Focus"],
  ])("fails closed when Begin.configuration.%s differs", (field, value, message) => {
    expect(() => validateVoiceBeginMessage({
      type: "Begin",
      id: "session-123",
      configuration: {
        model: ticket.model,
        mode: ticket.mode,
        api_version: ticket.apiVersion,
        voice_focus: ticket.voiceFocus,
        [field]: value,
      },
    }, ticket)).toThrow(message);
  });

  it("keeps audio frames at exactly 50 ms and schedules shutdown before the provider cap", () => {
    expect(voiceChunkSampleCount(16_000)).toBe(800);
    expect(voiceChunkSampleCount(48_000)).toBe(2_400);
    expect(voiceSessionStopDelayMs(180)).toBe(165_000);
  });
});
