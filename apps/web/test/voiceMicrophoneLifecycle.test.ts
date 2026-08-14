import { afterEach, describe, expect, it, vi } from "vitest";
import { microphoneError, requestMicrophoneStream } from "@/hooks/useVoiceAllocation";

// The microphone gate is the first thing `start()` touches, before a paid
// AssemblyAI credential is ever minted, so every failure mapped here fails
// closed at zero provider cost. Production denial and hang were exercised
// live against https://finaltab.vercel.app on 2026-08-14; these tests keep
// that behaviour from regressing without needing a browser or a session.

function fakeTrack() {
  return { stop: vi.fn() };
}

function fakeStream(trackCount = 1) {
  const tracks = Array.from({ length: trackCount }, fakeTrack);
  return { tracks, stream: { getTracks: () => tracks } as unknown as MediaStream };
}

function stubMediaDevices(getUserMedia: () => Promise<MediaStream>) {
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("microphone permission mapping", () => {
  it("tells the operator how to unblock a denied microphone", () => {
    for (const name of ["NotAllowedError", "SecurityError"]) {
      expect(microphoneError(new DOMException("denied", name))).toBe(
        "Microphone access is blocked. Allow it in browser settings, then start listening again.",
      );
    }
  });

  it("distinguishes a missing device from a device held by another app", () => {
    expect(microphoneError(new DOMException("none", "NotFoundError")))
      .toBe("No microphone was found on this device.");
    expect(microphoneError(new DOMException("busy", "NotReadableError")))
      .toBe("The microphone is being used by another app. Close that app, then try again.");
  });

  it("treats an aborted capture as an intentional stop, not a fault", () => {
    expect(microphoneError(new DOMException("aborted", "AbortError")))
      .toBe("Voice capture was stopped.");
  });

  it("surfaces a plain error message and never leaks a non-error value", () => {
    expect(microphoneError(new Error("Microphone permission timed out."))).toBe(
      "Microphone permission timed out.",
    );
    expect(microphoneError({ token: "not-an-error" })).toBe("Voice capture could not start.");
  });
});

describe("microphone acquisition", () => {
  it("returns the granted stream untouched", async () => {
    const { tracks, stream } = fakeStream();
    stubMediaDevices(() => Promise.resolve(stream));

    await expect(requestMicrophoneStream(50)).resolves.toBe(stream);
    expect(tracks[0].stop).not.toHaveBeenCalled();
  });

  it("rejects with the DOMException so the denial maps to a fix-it message", async () => {
    stubMediaDevices(() => Promise.reject(new DOMException("denied", "NotAllowedError")));

    await expect(requestMicrophoneStream(50)).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("bounds an unanswered permission prompt instead of hanging the control", async () => {
    stubMediaDevices(() => new Promise<MediaStream>(() => undefined));

    await expect(requestMicrophoneStream(20)).rejects.toThrow(
      "Microphone permission timed out. Choose Allow, then start listening again.",
    );
  });

  it("stops a stream the browser grants after the timeout has already fired", async () => {
    const { tracks, stream } = fakeStream(2);
    stubMediaDevices(() => new Promise<MediaStream>((resolve) => {
      setTimeout(() => resolve(stream), 40);
    }));

    await expect(requestMicrophoneStream(10)).rejects.toThrow("Microphone permission timed out.");
    // The late grant must not leave a live, unreferenced microphone open.
    await new Promise((resolve) => setTimeout(resolve, 80));
    for (const track of tracks) expect(track.stop).toHaveBeenCalledOnce();
  });
});
