"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Panel, Badge, Button, ErrorNote, Spinner, BlockedNote } from "./ui";
import { apiErrorText } from "@/lib/apiText";
import { checkLocalImageQuality } from "@/lib/imageOptimization";
import type { ReceiptState } from "@/lib/types";

interface ReceiptPanelProps {
  receipt: ReceiptState | null;
  onReceipt: (next: ReceiptState) => void;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function ReceiptPanel({ receipt, onReceipt }: ReceiptPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setBlocked(null);
      setQualityWarning(null);

      // Check image quality before upload
      try {
        const quality = await checkLocalImageQuality(file);
        if (quality.recommendation) {
          setQualityWarning(quality.recommendation);
        }
      } catch (e) {
        // Quality check error is non-fatal
        console.warn("[receipt-panel] quality check failed:", e);
      }

      try {
        const dataUrl = await fileToDataUrl(file);
        const res = await fetch("/api/vision/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl }),
        });
        const json = await res.json();
        if (res.status === 501) {
          setBlocked(apiErrorText(json, "Vision extraction is not configured."));
          return;
        }
        if (!res.ok) {
          setError(apiErrorText(json, `Extraction failed (HTTP ${res.status})`));
          return;
        }
        onReceipt({
          receipt: json.receipt,
          attempts: json.attempts ?? 1,
          arithmeticIssues: json.arithmeticIssues ?? [],
          imageDataUrl: dataUrl,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [onReceipt],
  );

  const parsed = receipt?.receipt ?? null;
  const currency = parsed?.currency ?? "";

  return (
    <Panel title="Receipt" step="01 · Extract">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {!parsed && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-edge bg-panel-2/50 p-8 text-fog transition-colors hover:border-fog hover:text-paper"
        >
          {busy ? (
            <>
              <Spinner />
              <span className="font-mono text-xs">Reading receipt with Groq vision…</span>
            </>
          ) : (
            <>
              <span className="text-2xl">⌘</span>
              <span className="font-mono text-xs uppercase tracking-wider">Drop or click to upload receipt</span>
              <span className="font-mono text-[10px] text-fog-dim">PNG · JPEG · WebP</span>
            </>
          )}
        </button>
      )}

      {parsed && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="receipt-paper relative mx-auto max-w-sm px-5 pb-6 pt-5 text-ink"
        >
          <div className="text-center">
            <p className="font-mono text-sm font-bold uppercase tracking-widest">{parsed.merchant}</p>
            <p className="mt-0.5 font-mono text-[10px] text-ink-soft">
              {parsed.date ?? "date unknown"} · {parsed.currency}
            </p>
          </div>
          <div className="my-3 border-t border-dashed border-ink-soft/40" />
          <ul className="space-y-1.5">
            {parsed.items.map((item, i) => (
              <li key={i} className="flex items-baseline font-mono text-[11px]">
                <span className="shrink-0">
                  {item.quantity > 1 ? `${item.quantity}× ` : ""}
                  {item.description}
                </span>
                <span className="leader mx-1 min-w-4 flex-1" />
                <span className="shrink-0 tabular-nums">{item.lineTotal}</span>
              </li>
            ))}
          </ul>
          <div className="my-3 border-t border-dashed border-ink-soft/40" />
          <div className="space-y-1 font-mono text-[11px]">
            {parsed.subtotal !== null && (
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{parsed.subtotal}</span>
              </div>
            )}
            {parsed.tax !== null && (
              <div className="flex justify-between">
                <span>Tax</span>
                <span className="tabular-nums">{parsed.tax}</span>
              </div>
            )}
            {parsed.serviceCharge !== null && (
              <div className="flex justify-between">
                <span>Service</span>
                <span className="tabular-nums">{parsed.serviceCharge}</span>
              </div>
            )}
            {parsed.tip !== null && (
              <div className="flex justify-between">
                <span>Tip</span>
                <span className="tabular-nums">{parsed.tip}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-ink-soft/40 pt-1 text-xs font-bold">
              <span>TOTAL {currency}</span>
              <span className="tabular-nums">{parsed.total}</span>
            </div>
          </div>
          <div className="receipt-tear absolute -bottom-[10px] left-0 w-full" />
        </motion.div>
      )}

      {receipt && parsed && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {receipt.arithmeticIssues.length === 0 ? (
            <Badge tone="lime">✓ arithmetic verified</Badge>
          ) : (
            <Badge tone="coral">{receipt.arithmeticIssues.length} arithmetic issue(s)</Badge>
          )}
          <Badge tone="fog">
            {receipt.attempts} extraction pass{receipt.attempts === 1 ? "" : "es"}
          </Badge>
          <Button variant="ghost" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Reading…" : "Replace"}
          </Button>
        </div>
      )}

      {receipt && receipt.arithmeticIssues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {receipt.arithmeticIssues.map((issue, i) => (
            <li key={i} className="font-mono text-[10px] text-coral">
              {issue}
            </li>
          ))}
        </ul>
      )}

      {qualityWarning && (
        <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="font-mono text-xs text-amber-600">{qualityWarning}</p>
        </div>
      )}

      {error && <ErrorNote message={error} />}
      {blocked && <BlockedNote message={blocked} />}
    </Panel>
  );
}
