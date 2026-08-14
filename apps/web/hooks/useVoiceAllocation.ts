"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  buildVoiceWebSocketUrl,
  composeVoiceTranscript,
  parseVoiceSessionTicket,
  validateVoiceBeginMessage,
  VOICE_CHUNK_MILLISECONDS,
  voiceSessionStopDelayMs,
} from "@/lib/voiceClient";

export type VoiceStatus = "idle" | "connecting" | "listening" | "stopping" | "error";
export type ReadbackStatus = "idle" | "loading" | "ready" | "playing" | "error";

interface VoiceResources {
  abortController: AbortController;
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  source: MediaStreamAudioSourceNode | null;
  worklet: AudioWorkletNode | null;
  silentGain: GainNode | null;
  socket: WebSocket | null;
  expectedClose: boolean;
  stopRequested: boolean;
  terminateSent: boolean;
  terminationReceived: boolean;
  speechObserved: boolean;
  pendingTurn: boolean;
  awaitingFinalTurn: boolean;
  finalTurnAfterStop: boolean;
  failureMessage: string | null;
  captureStarted: boolean;
  resumePending: boolean;
  streamInactiveHandler: (() => void) | null;
  trackEndedHandlers: Array<{ track: MediaStreamTrack; handler: () => void }>;
  contextStateHandler: (() => void) | null;
  sessionTimer: number | null;
  forceTimer: number | null;
  closeTimer: number | null;
}

interface TurnMessage {
  type: "Turn";
  turn_order?: unknown;
  end_of_turn?: unknown;
  transcript?: unknown;
  language_code?: unknown;
}

interface UseVoiceAllocationOptions {
  onLevel?: (level: number) => void;
}

const CLOSE_REASON: Record<number, string> = {
  1008: "The temporary voice session was rejected. Start a new session and try again.",
  3005: "The transcription session was cancelled upstream. Start listening again.",
  3006: "The transcription service rejected a session message.",
  3007: "Live audio arrived outside the supported timing window. Start listening again.",
  3008: "The transcription session reached its time limit. Start a fresh session.",
  3009: "All live transcription slots are busy. Try again in a moment.",
};

async function requestMicrophoneStream(timeoutMs = 12_000): Promise<MediaStream> {
  const request = navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  let accepted = false;
  let timeoutId: number | null = null;
  try {
    const stream = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error("Microphone permission timed out. Choose Allow, then start listening again.")),
          timeoutMs,
        );
      }),
    ]);
    accepted = true;
    return stream;
  } catch (error) {
    // A permission prompt cannot be cancelled. If the browser resolves it
    // after our UI timeout, immediately release that late stream.
    void request.then((stream) => {
      if (!accepted) stream.getTracks().forEach((track) => track.stop());
    }).catch(() => undefined);
    throw error;
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

function releaseAudio(resources: VoiceResources): void {
  if (resources.stream && resources.streamInactiveHandler) {
    resources.stream.removeEventListener("inactive", resources.streamInactiveHandler);
  }
  resources.streamInactiveHandler = null;
  for (const { track, handler } of resources.trackEndedHandlers) {
    track.removeEventListener("ended", handler);
  }
  resources.trackEndedHandlers = [];
  if (resources.worklet) {
    resources.worklet.port.onmessage = null;
    resources.worklet.disconnect();
    resources.worklet = null;
  }
  resources.source?.disconnect();
  resources.source = null;
  resources.silentGain?.disconnect();
  resources.silentGain = null;
  if (resources.audioContext) {
    if (resources.contextStateHandler) {
      resources.audioContext.removeEventListener("statechange", resources.contextStateHandler);
    }
    void resources.audioContext.close().catch(() => undefined);
    resources.audioContext = null;
  }
  resources.contextStateHandler = null;
  resources.captureStarted = false;
  resources.resumePending = false;
  resources.stream?.getTracks().forEach((track) => track.stop());
  resources.stream = null;
}

function clearResourceTimers(resources: VoiceResources): void {
  if (resources.sessionTimer !== null) window.clearTimeout(resources.sessionTimer);
  if (resources.forceTimer !== null) window.clearTimeout(resources.forceTimer);
  if (resources.closeTimer !== null) window.clearTimeout(resources.closeTimer);
  resources.sessionTimer = null;
  resources.forceTimer = null;
  resources.closeTimer = null;
}

function sendTerminate(resources: VoiceResources): void {
  if (resources.terminateSent || resources.socket?.readyState !== WebSocket.OPEN) return;
  resources.socket.send(JSON.stringify({ type: "Terminate" }));
  resources.terminateSent = true;
}

function microphoneError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access is blocked. Allow it in browser settings, then start listening again.";
    }
    if (error.name === "NotFoundError") return "No microphone was found on this device.";
    if (error.name === "NotReadableError") {
      return "The microphone is being used by another app. Close that app, then try again.";
    }
    if (error.name === "AbortError") return "Voice capture was stopped.";
  }
  return error instanceof Error ? error.message : "Voice capture could not start.";
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      if ("message" in body && typeof body.message === "string") return body.message;
      if ("error" in body && typeof body.error === "string") return body.error;
    }
  } catch {
    // A non-JSON upstream failure still gets a useful local message.
  }
  return `${fallback} (HTTP ${response.status}).`;
}

function awaitSocketOpen(socket: WebSocket, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Live transcription did not connect in time.")), 10_000);

    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new DOMException("Voice capture stopped", "AbortError"));
    const onOpen = () => finish();
    const onClose = (event: CloseEvent) => {
      finish(new Error(CLOSE_REASON[event.code] ?? "Live transcription closed before it was ready."));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("close", onClose, { once: true });
  });
}

function awaitValidatedBegin(
  socket: WebSocket,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => finish(new Error("AssemblyAI did not send a valid Begin frame in time.")),
      8_000,
    );

    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new DOMException("Voice capture stopped", "AbortError"));
    const onClose = () => finish(new Error("Live transcription closed before its Begin confirmation."));
    const onError = () => finish(new Error("Live transcription failed before its Begin confirmation."));
    const onMessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") {
        finish(new Error("AssemblyAI returned a non-text frame before its Begin confirmation."));
        return;
      }
      try {
        validateVoiceBeginMessage(JSON.parse(event.data) as unknown);
        finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error("AssemblyAI Begin validation failed."));
      }
    };

    signal.addEventListener("abort", onAbort, { once: true });
    socket.addEventListener("message", onMessage, { once: true });
    socket.addEventListener("close", onClose, { once: true });
    socket.addEventListener("error", onError, { once: true });
  });
}

export function useVoiceAllocation({ onLevel }: UseVoiceAllocationOptions = {}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [languageCode, setLanguageCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const resourcesRef = useRef<VoiceResources | null>(null);
  const finalTurnsRef = useRef(new Map<number, string>());
  const onLevelRef = useRef(onLevel);

  useEffect(() => {
    onLevelRef.current = onLevel;
  }, [onLevel]);

  const disposeResources = useCallback((resources: VoiceResources, closeSocket: boolean) => {
    resources.abortController.abort();
    clearResourceTimers(resources);
    releaseAudio(resources);
    const socket = resources.socket;
    if (socket) {
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (closeSocket && socket.readyState === WebSocket.OPEN) {
        sendTerminate(resources);
        socket.close(1000, "FINALTab voice session complete");
      } else if (closeSocket && socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
    resources.socket = null;
    if (resourcesRef.current === resources) resourcesRef.current = null;
    onLevelRef.current?.(0);
  }, []);

  const shutdownImmediately = useCallback((resources: VoiceResources | null) => {
    if (!resources) return;
    resources.expectedClose = true;
    disposeResources(resources, true);
  }, [disposeResources]);

  useEffect(() => {
    mountedRef.current = true;
    const onPageHide = () => shutdownImmediately(resourcesRef.current);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", onPageHide);
      shutdownImmediately(resourcesRef.current);
    };
  }, [shutdownImmediately]);

  const requestGracefulStop = useCallback((resources: VoiceResources, failureMessage?: string) => {
    if (resourcesRef.current !== resources) return;
    if (failureMessage && !resources.failureMessage) resources.failureMessage = failureMessage;
    if (resources.stopRequested) return;

    resources.stopRequested = true;
    resources.expectedClose = true;
    resources.awaitingFinalTurn = resources.pendingTurn;
    resources.abortController.abort();
    if (resources.sessionTimer !== null) window.clearTimeout(resources.sessionTimer);
    resources.sessionTimer = null;
    releaseAudio(resources);
    onLevelRef.current?.(0);
    if (mountedRef.current) {
      setStatus("stopping");
      if (resources.failureMessage) setError(resources.failureMessage);
    }

    const socket = resources.socket;
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      const terminalError = resources.failureMessage;
      disposeResources(resources, false);
      if (mountedRef.current) {
        setStatus(terminalError ? "error" : "idle");
        if (terminalError) setError(terminalError);
      }
      return;
    }
    if (socket.readyState === WebSocket.CONNECTING) {
      const terminalError = resources.failureMessage;
      disposeResources(resources, true);
      if (mountedRef.current) {
        setStatus(terminalError ? "error" : "idle");
        if (terminalError) setError(terminalError);
      }
      return;
    }

    // Force the in-flight utterance to become a final Turn, then send
    // Terminate from that Turn handler. The fallback is for silence or a
    // provider that fails to finalize; it does not close the socket.
    socket.send(JSON.stringify({ type: "ForceEndpoint" }));
    resources.forceTimer = window.setTimeout(() => {
      sendTerminate(resources);
    }, resources.awaitingFinalTurn ? 3_000 : 1_500);

    // Normal shutdown closes only after AssemblyAI's Termination message.
    // This longer watchdog is the abnormal escape hatch that prevents a
    // billable session from lingering if the provider never acknowledges it.
    resources.closeTimer = window.setTimeout(() => {
      if (resourcesRef.current !== resources || resources.terminationReceived) return;
      const timeoutMessage = "Live transcription did not confirm shutdown. The session was closed safely.";
      resources.failureMessage ??= timeoutMessage;
      sendTerminate(resources);
      if (socket.readyState === WebSocket.OPEN) socket.close(4000, "voice termination timeout");
      disposeResources(resources, false);
      if (mountedRef.current) {
        setStatus("error");
        setError(resources.failureMessage);
      }
    }, 12_000);
  }, [disposeResources]);

  const stop = useCallback(() => {
    const resources = resourcesRef.current;
    if (!resources) {
      setStatus("idle");
      return;
    }
    requestGracefulStop(resources);
  }, [requestGracefulStop]);

  const clearTranscript = useCallback(() => {
    finalTurnsRef.current.clear();
    setFinalTranscript("");
    setPartialTranscript("");
    setLanguageCode(null);
    setError(null);
  }, []);

  const start = useCallback(async () => {
    shutdownImmediately(resourcesRef.current);
    const resources: VoiceResources = {
      abortController: new AbortController(),
      stream: null,
      audioContext: null,
      source: null,
      worklet: null,
      silentGain: null,
      socket: null,
      expectedClose: false,
      stopRequested: false,
      terminateSent: false,
      terminationReceived: false,
      speechObserved: false,
      pendingTurn: false,
      awaitingFinalTurn: false,
      finalTurnAfterStop: false,
      failureMessage: null,
      captureStarted: false,
      resumePending: false,
      streamInactiveHandler: null,
      trackEndedHandlers: [],
      contextStateHandler: null,
      sessionTimer: null,
      forceTimer: null,
      closeTimer: null,
    };
    resourcesRef.current = resources;
    finalTurnsRef.current.clear();
    setFinalTranscript("");
    setPartialTranscript("");
    setLanguageCode(null);
    setError(null);
    setStatus("connecting");

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
        throw new Error("This browser does not support live microphone transcription. Type the allocation instead.");
      }

      const stream = await requestMicrophoneStream();
      resources.stream = stream;
      if (resourcesRef.current !== resources || resources.expectedClose) {
        releaseAudio(resources);
        return;
      }
      const liveAudioTracks = stream.getAudioTracks().filter((track) => track.readyState === "live");
      if (!stream.active || liveAudioTracks.length === 0) {
        throw new Error("The microphone stream ended before voice capture could start.");
      }
      const onStreamInactive = () => requestGracefulStop(
        resources,
        "The microphone stream became inactive. Check the selected input and start again.",
      );
      resources.streamInactiveHandler = onStreamInactive;
      stream.addEventListener("inactive", onStreamInactive);
      for (const track of liveAudioTracks) {
        const onTrackEnded = () => requestGracefulStop(
          resources,
          "The selected microphone disconnected or stopped. Choose an available input and start again.",
        );
        resources.trackEndedHandlers.push({ track, handler: onTrackEnded });
        track.addEventListener("ended", onTrackEnded);
      }

      const tokenResponse = await fetch("/api/voice/token", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: resources.abortController.signal,
      });
      if (!tokenResponse.ok) {
        throw new Error(await responseError(tokenResponse, "A temporary voice session could not be created"));
      }
      const ticket = parseVoiceSessionTicket(await tokenResponse.json());
      if (resourcesRef.current !== resources || resources.expectedClose) return;

      const socket = new WebSocket(buildVoiceWebSocketUrl(ticket));
      resources.socket = socket;
      socket.binaryType = "arraybuffer";
      // Keep provider termination observable even if the user stops while the
      // socket is still waiting for its validated Begin frame.
      socket.onmessage = (event) => {
        if (typeof event.data !== "string" || resourcesRef.current !== resources) return;
        try {
          const message: unknown = JSON.parse(event.data);
          if (typeof message === "object" && message !== null && "type" in message && message.type === "Termination") {
            resources.terminationReceived = true;
            resources.expectedClose = true;
            if (!resources.stopRequested) {
              resources.failureMessage = "AssemblyAI ended the voice session unexpectedly. Start a fresh session.";
            }
            if (socket.readyState === WebSocket.OPEN) socket.close(1000, "AssemblyAI termination received");
          }
        } catch {
          // Begin validation owns malformed preflight frames and fails closed.
        }
      };
      socket.onerror = () => {
        if (!resources.expectedClose && mountedRef.current) {
          setError("The live transcription connection was interrupted. Stop and start a fresh session.");
        }
      };
      socket.onclose = (event) => {
        const expectedTermination = resources.expectedClose && resources.terminationReceived;
        const terminalError = resources.failureMessage;
        disposeResources(resources, false);
        if (!mountedRef.current) return;
        if (terminalError) {
          setStatus("error");
          setError(terminalError);
        } else if (expectedTermination) {
          setStatus("idle");
        } else {
          setStatus("error");
          setError(
            resources.expectedClose
              ? "Live transcription closed before confirming provider termination. Start a fresh session."
              : CLOSE_REASON[event.code] ?? "Live transcription disconnected. Start listening again.",
          );
        }
      };

      await Promise.all([
        awaitSocketOpen(socket, resources.abortController.signal),
        awaitValidatedBegin(socket, resources.abortController.signal),
      ]);
      if (resourcesRef.current !== resources || resources.expectedClose) return;

      socket.onmessage = (event) => {
        if (typeof event.data !== "string" || resourcesRef.current !== resources) return;
        try {
          const message: unknown = JSON.parse(event.data);
          if (typeof message !== "object" || message === null || !("type" in message)) return;
          if (message.type === "SpeechStarted") {
            resources.speechObserved = true;
            resources.pendingTurn = true;
            if (resources.stopRequested) resources.awaitingFinalTurn = true;
          }
          if (message.type === "Turn") {
            const turn = message as TurnMessage;
            if (typeof turn.transcript !== "string" || typeof turn.turn_order !== "number") return;
            if (turn.transcript.trim()) resources.speechObserved = true;
            if (typeof turn.language_code === "string") setLanguageCode(turn.language_code);
            if (turn.end_of_turn === true) {
              resources.pendingTurn = false;
              finalTurnsRef.current.set(turn.turn_order, turn.transcript);
              setFinalTranscript(composeVoiceTranscript(finalTurnsRef.current));
              setPartialTranscript("");
              if (resources.stopRequested) {
                resources.awaitingFinalTurn = false;
                resources.finalTurnAfterStop = true;
                if (resources.forceTimer !== null) window.clearTimeout(resources.forceTimer);
                resources.forceTimer = null;
                sendTerminate(resources);
              }
            } else {
              resources.pendingTurn = true;
              if (resources.stopRequested) resources.awaitingFinalTurn = true;
              setPartialTranscript(turn.transcript);
            }
          }
          if (message.type === "Termination") {
            resources.terminationReceived = true;
            resources.expectedClose = true;
            if (!resources.stopRequested) {
              resources.failureMessage = "AssemblyAI ended the voice session unexpectedly. Start a fresh session.";
            } else if (resources.awaitingFinalTurn) {
              resources.failureMessage = "AssemblyAI ended the session before returning the final spoken words.";
            }
            if (socket.readyState === WebSocket.OPEN) socket.close(1000, "AssemblyAI termination received");
          }
        } catch {
          requestGracefulStop(resources, "AssemblyAI returned an invalid streaming message. Start a fresh session.");
        }
      };

      const audioContext = new AudioContext();
      resources.audioContext = audioContext;
      await audioContext.audioWorklet.addModule("/audio/finaltab-pcm-worklet.js");
      if (resourcesRef.current !== resources || resources.expectedClose) return;

      if (!resources.stream) throw new Error("The microphone stream ended before capture started.");
      const source = audioContext.createMediaStreamSource(resources.stream);
      const worklet = new AudioWorkletNode(audioContext, "finaltab-pcm16", {
        processorOptions: {
          targetSampleRate: ticket.sampleRate,
          chunkMilliseconds: VOICE_CHUNK_MILLISECONDS,
        },
      });
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      resources.source = source;
      resources.worklet = worklet;
      resources.silentGain = silentGain;
      worklet.port.onmessage = (event: MessageEvent<unknown>) => {
        if (resourcesRef.current !== resources || resources.terminateSent) return;
        const data = event.data;
        if (typeof data !== "object" || data === null) return;
        if (!("type" in data) || data.type !== "chunk") return;
        if ("level" in data && typeof data.level === "number") onLevelRef.current?.(data.level);
        if (
          "audio" in data &&
          data.audio instanceof ArrayBuffer &&
          resources.socket?.readyState === WebSocket.OPEN
        ) {
          resources.socket.send(data.audio);
        }
      };
      source.connect(worklet).connect(silentGain).connect(audioContext.destination);
      await audioContext.resume();
      if (audioContext.state !== "running") {
        throw new Error("The browser could not keep its audio capture engine running.");
      }
      resources.captureStarted = true;
      const onContextStateChange = () => {
        if (
          resourcesRef.current !== resources ||
          resources.expectedClose ||
          !resources.captureStarted ||
          !resources.audioContext
        ) return;
        const currentContext = resources.audioContext;
        if (currentContext.state === "running" || resources.resumePending) return;
        if (currentContext.state === "closed") {
          requestGracefulStop(resources, "The browser audio engine closed. Start voice capture again.");
          return;
        }
        resources.resumePending = true;
        void currentContext.resume().then(() => {
          resources.resumePending = false;
          if (
            resourcesRef.current === resources &&
            !resources.expectedClose &&
            currentContext.state !== "running"
          ) {
            requestGracefulStop(resources, "The browser suspended microphone audio. Return to this tab and start again.");
          }
        }).catch(() => {
          resources.resumePending = false;
          requestGracefulStop(resources, "The browser suspended microphone audio. Return to this tab and start again.");
        });
      };
      resources.contextStateHandler = onContextStateChange;
      audioContext.addEventListener("statechange", onContextStateChange);
      resources.sessionTimer = window.setTimeout(
        () => requestGracefulStop(resources),
        voiceSessionStopDelayMs(ticket.maxSessionDurationSeconds),
      );
      if (mountedRef.current && resourcesRef.current === resources) setStatus("listening");
    } catch (caught) {
      const intentionallyStopped = resources.expectedClose || resources.abortController.signal.aborted;
      if (intentionallyStopped) return;
      disposeResources(resources, true);
      if (!mountedRef.current) return;
      setStatus("error");
      setError(microphoneError(caught));
    }
  }, [disposeResources, requestGracefulStop, shutdownImmediately]);

  return {
    status,
    finalTranscript,
    partialTranscript,
    transcript: composeVoiceTranscript(finalTurnsRef.current, partialTranscript),
    languageCode,
    error,
    start,
    stop,
    clearTranscript,
  };
}

export function releaseReadback(
  audioRef: MutableRefObject<HTMLAudioElement | null>,
  urlRef: MutableRefObject<string | null>,
  revokeUrl: boolean,
): void {
  const audio = audioRef.current;
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
  }
  audioRef.current = null;
  if (revokeUrl && urlRef.current) URL.revokeObjectURL(urlRef.current);
  if (revokeUrl) urlRef.current = null;
}

export function useVoiceReadback(muted: boolean) {
  const [status, setStatus] = useState<ReadbackStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const preparedTextRef = useRef("");

  const stop = useCallback((revokeUrl = true) => {
    abortRef.current?.abort();
    abortRef.current = null;
    releaseReadback(audioRef, urlRef, revokeUrl);
    if (revokeUrl) preparedTextRef.current = "";
    if (mountedRef.current) {
      setStatus("idle");
      if (revokeUrl) setDownloadUrl(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  useEffect(() => {
    if (muted) stop();
  }, [muted, stop]);

  const playPrepared = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    try {
      await audio.play();
      if (mountedRef.current) {
        setStatus("playing");
        setError(null);
      }
    } catch {
      if (mountedRef.current) {
        setStatus("ready");
        setError("Audio is ready, but the browser blocked playback. Press Read back once more.");
      }
    }
  }, []);

  const speak = useCallback(async (rawText: string) => {
    const text = rawText.trim().slice(0, 600);
    if (!text || muted) return;
    if (audioRef.current && preparedTextRef.current === text) {
      await playPrepared();
      return;
    }

    stop();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "audio/mpeg", "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response, "Voice readback could not be generated"));
      const blob = await response.blob();
      if (controller.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audio.preload = "auto";
      audioRef.current = audio;
      preparedTextRef.current = text;
      if (mountedRef.current) setDownloadUrl(url);
      audio.onended = () => {
        if (mountedRef.current) setStatus("ready");
      };
      audio.onerror = () => {
        if (mountedRef.current) {
          setStatus("error");
          setError("The generated readback could not be played on this device.");
        }
      };
      await playPrepared();
    } catch (caught) {
      if (controller.signal.aborted || !mountedRef.current) return;
      releaseReadback(audioRef, urlRef, true);
      preparedTextRef.current = "";
      setDownloadUrl(null);
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Voice readback failed.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [muted, playPrepared, stop]);

  return { status, error, downloadUrl, speak, stop };
}
