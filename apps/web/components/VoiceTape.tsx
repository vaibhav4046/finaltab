"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Trash2, Volume2, VolumeX } from "lucide-react";
import { useVoiceAllocation, useVoiceReadback, type VoiceStatus } from "@/hooks/useVoiceAllocation";
import styles from "./VoiceTape.module.css";

interface VoiceTapeProps {
  disabled?: boolean;
  instruction: string;
  readbackText?: string | null;
  onUseTranscript: (transcript: string) => void;
}

const METER_PROFILE = [0.42, 0.7, 0.5, 0.9, 0.58, 1, 0.62, 0.78, 0.48, 0.92, 0.56, 0.76, 0.46, 0.86, 0.52, 0.68, 0.4];

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: "Ready",
  connecting: "Opening mic",
  listening: "Listening",
  stopping: "Printing final words",
  error: "Needs attention",
};

export function VoiceTape({ disabled = false, instruction, readbackText, onUseTranscript }: VoiceTapeProps) {
  const [muted, setMuted] = useState(false);
  const [appliedTranscript, setAppliedTranscript] = useState("");
  const meterRef = useRef<HTMLDivElement | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const pendingLevelRef = useRef(0);

  const paintLevel = useCallback((level: number) => {
    pendingLevelRef.current = level;
    if (meterFrameRef.current !== null) return;
    meterFrameRef.current = window.requestAnimationFrame(() => {
      meterFrameRef.current = null;
      const bars = meterRef.current?.children;
      if (!bars) return;
      const current = pendingLevelRef.current;
      for (let index = 0; index < bars.length; index += 1) {
        const bar = bars[index] as HTMLElement;
        const scale = Math.max(0.08, Math.min(1, current * METER_PROFILE[index] * 1.8));
        bar.style.transform = `scaleY(${scale.toFixed(3)})`;
        bar.style.opacity = (0.34 + Math.min(0.55, current)).toFixed(2);
      }
    });
  }, []);

  useEffect(() => () => {
    if (meterFrameRef.current !== null) window.cancelAnimationFrame(meterFrameRef.current);
  }, []);

  const voice = useVoiceAllocation({ onLevel: paintLevel });
  const readback = useVoiceReadback(muted);
  const stopVoice = voice.stop;
  const busy = voice.status === "connecting" || voice.status === "stopping";
  const listening = voice.status === "listening";
  const captureActive = voice.status === "connecting" || listening;
  const usableTranscript = voice.finalTranscript.trim();
  const transcriptWasApplied = usableTranscript.length > 0 && appliedTranscript === usableTranscript && instruction.trim() === usableTranscript;
  const spokenText = useMemo(
    () => readbackText?.trim() || usableTranscript,
    [readbackText, usableTranscript],
  );

  useEffect(() => {
    if (disabled && captureActive) stopVoice();
  }, [captureActive, disabled, stopVoice]);

  const useTranscript = () => {
    if (!usableTranscript) return;
    onUseTranscript(usableTranscript);
    setAppliedTranscript(usableTranscript);
  };

  const toggleMute = () => {
    setMuted((current) => !current);
  };

  return (
    <section className={`${styles.tape} mt-3`} aria-label="Voice allocation receipt">
      <div className="relative grid grid-cols-[24px_1fr] gap-x-3 px-3 py-3">
        <div className="flex justify-center pt-1 font-mono text-xs font-semibold text-ink-soft" aria-hidden="true">
          VO
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-ink">Voice receipt</p>
              <p className="font-mono text-xs text-ink-soft">Live dictation · short buffered readback</p>
            </div>
            <span className={`${styles.stamp} font-mono text-xs font-bold uppercase tracking-wider ${voice.status === "error" ? "text-[#b7322e]" : listening ? "text-[#287657]" : "text-ink-soft"}`}>
              {STATUS_LABEL[voice.status]}
            </span>
          </div>

          <div ref={meterRef} className={`${styles.trace} mt-3`} aria-hidden="true">
            {METER_PROFILE.map((height, index) => (
              <span key={`${height}-${index}`} className={styles.bar} />
            ))}
          </div>

          <div className="min-h-[76px] py-3 font-mono text-[12px] leading-5 text-ink">
            {voice.finalTranscript ? <span>{voice.finalTranscript}</span> : null}
            {voice.partialTranscript ? (
              <span className={voice.finalTranscript ? "ml-1 text-ink-soft" : "text-ink-soft"}>{voice.partialTranscript}</span>
            ) : null}
            {!voice.transcript ? (
              <span className="text-ink-soft">Say who had what. Example: “Hem and Ravi shared the lamb.”</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-ink-soft/30 pt-2">
            {listening ? (
              <button
                type="button"
                onClick={stopVoice}
                className={`${styles.control} inline-flex items-center gap-2 rounded-md bg-ink px-3 font-mono text-xs font-bold uppercase tracking-wider text-paper transition-colors hover:bg-ink-soft`}
              >
                <Square size={14} fill="currentColor" aria-hidden="true" /> Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void voice.start()}
                disabled={disabled || busy}
                className={`${styles.control} inline-flex items-center gap-2 rounded-md bg-ink px-3 font-mono text-xs font-bold uppercase tracking-wider text-paper transition-colors hover:bg-ink-soft`}
              >
                <Mic size={15} aria-hidden="true" /> {busy ? "Opening…" : "Start listening"}
              </button>
            )}

            <button
              type="button"
              onClick={useTranscript}
              disabled={!usableTranscript || listening || busy || disabled || transcriptWasApplied}
              className={`${styles.control} rounded-md border border-ink-soft/40 bg-transparent px-3 font-mono text-xs font-bold uppercase tracking-wider text-ink transition-colors hover:bg-ink/5`}
            >
              {transcriptWasApplied ? "Transcript used" : "Use transcript"}
            </button>

            <button
              type="button"
              onClick={() => void readback.speak(spokenText)}
              disabled={!spokenText || muted || readback.status === "loading"}
              className={`${styles.control} inline-flex items-center gap-2 rounded-md border border-ink-soft/40 bg-transparent px-3 font-mono text-xs font-bold uppercase tracking-wider text-ink transition-colors hover:bg-ink/5`}
            >
              <Volume2 size={15} aria-hidden="true" />
              {readback.status === "loading" ? "Preparing clip…" : readback.status === "playing" ? "Reading…" : "Read back"}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? "Enable spoken readback" : "Mute spoken readback"}
              title={muted ? "Enable spoken readback" : "Mute spoken readback"}
              className={`${styles.control} grid place-items-center rounded-md border border-ink-soft/40 text-ink transition-colors hover:bg-ink/5`}
            >
              {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
            </button>

            <button
              type="button"
              onClick={() => {
                voice.clearTranscript();
                setAppliedTranscript("");
              }}
              disabled={!voice.transcript || listening || busy}
              aria-label="Clear voice transcript"
              title="Clear voice transcript"
              className={`${styles.control} grid place-items-center rounded-md border border-ink-soft/40 text-ink transition-colors hover:bg-ink/5`}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>

          <p className="sr-only" aria-live="polite">
            Voice input: {STATUS_LABEL[voice.status]}. {voice.finalTranscript ? "A final transcript is ready." : ""}
          </p>
          {voice.languageCode ? (
            <p className="mt-2 font-mono text-xs uppercase tracking-wider text-ink-soft">Detected language · {voice.languageCode}</p>
          ) : null}
          {voice.error ? <p className="mt-2 font-mono text-xs leading-5 text-[#9e2725]" role="alert">{voice.error}</p> : null}
          {readback.error ? <p className="mt-2 font-mono text-xs leading-5 text-[#9e2725]" role="alert">{readback.error}</p> : null}
          <p className="mt-2 font-mono text-xs leading-5 text-ink-soft">
            Readback generates a short ElevenLabs clip before playback. The transcript stays editable; nothing is
            allocated or signed until you use it and continue.
          </p>
        </div>
      </div>
    </section>
  );
}
