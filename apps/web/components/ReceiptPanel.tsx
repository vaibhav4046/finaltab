"use client";

import { useCallback, useRef, useState } from "react";
import {
  ParsedReceiptSchema,
  checkReceiptArithmetic,
  parseFiat,
  type ParsedReceipt,
} from "@finaltab/engine";
import { Panel, Badge, Button, ErrorNote, Spinner, BlockedNote } from "./ui";
import { apiErrorText } from "@/lib/apiText";
import { checkLocalImageQuality, prepareReceiptImage } from "@/lib/imageOptimization";
import type { ReceiptState } from "@/lib/types";

interface ReceiptPanelProps {
  receipt: ReceiptState | null;
  onReceipt: (next: ReceiptState) => void;
  locked?: boolean;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateReceiptUpload(
  file: Pick<File, "size" | "type">,
  consent: boolean,
): string | null {
  if (!consent) return "Confirm the receipt-processing consent before uploading.";
  if (!ALLOWED_TYPES.has(file.type)) return "Use a PNG, JPEG, or WebP image.";
  if (file.size > MAX_FILE_BYTES) return "That image is over 10 MB. Crop or compress it first.";
  return null;
}

function amountToMinor(value: string): bigint | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  try {
    return parseFiat(value);
  } catch {
    return null;
  }
}

function minorToAmount(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

function recalculate(receipt: ParsedReceipt): ParsedReceipt {
  const subtotal = receipt.items.reduce((total, item) => {
    const unit = amountToMinor(item.unitPrice) ?? 0n;
    return total + unit * BigInt(item.quantity);
  }, 0n);
  const items = receipt.items.map((item) => ({
    ...item,
    lineTotal: minorToAmount((amountToMinor(item.unitPrice) ?? 0n) * BigInt(item.quantity)),
  }));
  const extras = [receipt.tax, receipt.tip, receipt.serviceCharge].reduce<bigint>(
    (total, value) => total + (value ? amountToMinor(value) ?? 0n : 0n),
    0n,
  );
  return { ...receipt, items, subtotal: minorToAmount(subtotal), total: minorToAmount(subtotal + extras) };
}

export function ReceiptPanel({ receipt, onReceipt, locked = false }: ReceiptPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyStage, setBusyStage] = useState("Preparing receipt…");
  const [dragging, setDragging] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParsedReceipt | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const validationError = validateReceiptUpload(file, consent);
      if (validationError) {
        setError(validationError);
        return;
      }

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      setBusy(true);
      setBusyStage("Checking photo quality…");
      setError(null);
      setBlocked(null);
      setQualityWarning(null);
      setDraft(null);

      try {
        try {
          const quality = await checkLocalImageQuality(file);
          if (quality.recommendation) setQualityWarning(quality.recommendation);
        } catch {
          // Advisory only. Extraction remains available if local analysis fails.
        }

        if (controller.signal.aborted) return;
        setBusyStage("Optimizing secure upload…");
        const dataUrl = await prepareReceiptImage(file);
        if (controller.signal.aborted) return;
        setBusyStage("Extracting and reconciling line items…");
        const response = await fetch("/api/vision/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl }),
          signal: controller.signal,
        });
        const json = await response.json();
        if (response.status === 501) {
          setBlocked(apiErrorText(json, "Vision extraction is not configured."));
          return;
        }
        if (!response.ok) {
          setError(apiErrorText(json, `Extraction failed (HTTP ${response.status})`));
          return;
        }
        const parsed = ParsedReceiptSchema.parse(json.receipt);
        onReceipt({
          receipt: parsed,
          attempts: json.attempts ?? 1,
          provider: typeof json.provider === "string" ? json.provider : undefined,
          arithmeticIssues: Array.isArray(json.arithmeticIssues) ? json.arithmeticIssues : [],
          // The full image has served its purpose and is deliberately released.
          imageDataUrl: "",
          confirmedAt: undefined,
        });
        // Provider consent is one-shot: replacing this image requires a fresh confirmation.
        setConsent(false);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Upload failed.");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
      }
    },
    [consent, onReceipt],
  );

  const saveDraft = () => {
    if (!receipt || !draft) return;
    const normalized = recalculate(draft);
    const result = ParsedReceiptSchema.safeParse(normalized);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Correct the receipt fields.");
      return;
    }
    const issues = checkReceiptArithmetic(result.data).map((issue) => `${issue.code}: ${issue.message}`);
    onReceipt({ ...receipt, receipt: result.data, arithmeticIssues: issues, confirmedAt: undefined });
    setDraft(null);
    setError(null);
  };

  const confirmReceipt = () => {
    if (!receipt) return;
    const result = ParsedReceiptSchema.safeParse(receipt.receipt);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Receipt is invalid.");
      return;
    }
    const issues = checkReceiptArithmetic(result.data);
    if (issues.length > 0) {
      setError("Fix the highlighted arithmetic before confirming this receipt.");
      onReceipt({ ...receipt, arithmeticIssues: issues.map((issue) => `${issue.code}: ${issue.message}`), confirmedAt: undefined });
      return;
    }
    onReceipt({ ...receipt, receipt: result.data, arithmeticIssues: [], confirmedAt: new Date().toISOString() });
    setError(null);
  };

  const parsed = receipt?.receipt ?? null;
  const currency = parsed?.currency ?? "";

  return (
    <Panel title="Receipt" step="01 · Scan & confirm">
      <input
        ref={inputRef}
        type="file"
        aria-label="Upload a receipt image"
        tabIndex={-1}
        accept="image/png,image/jpeg,image/webp"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />

      {!parsed ? (
        <div
          onPaste={(event) => {
            const file = Array.from(event.clipboardData.files).find((candidate) =>
              ALLOWED_TYPES.has(candidate.type),
            );
            if (!file) return;
            event.preventDefault();
            void handleFile(file);
          }}
        >
          <label className="mb-3 flex min-h-11 cursor-pointer items-start gap-1 rounded-lg border border-edge-soft bg-panel-2 p-2 text-sm text-fog sm:gap-2">
            <span className="grid h-11 w-11 shrink-0 place-items-center">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="h-5 w-5 accent-signal"
              />
            </span>
            <span>
              I consent to this image being sent to the configured vision provider for extraction.
              FINALTab releases the image from browser state after extraction; the editable receipt data remains.
            </span>
          </label>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            disabled={busy || locked || !consent}
            className={`flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-fog transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              dragging ? "border-signal bg-signal/10 text-paper" : "border-edge bg-panel-2/50 hover:border-fog hover:text-paper"
            }`}
          >
            {busy ? (
              <>
                <Spinner />
                <span className="font-mono text-xs" aria-live="polite">{busyStage}</span>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="text-2xl">⌁</span>
                <span className="font-mono text-xs uppercase tracking-wider">Take photo, drop, browse, or paste</span>
                <span className="text-xs text-fog-dim">PNG · JPEG · WebP · 10 MB max</span>
                <span className="text-xs text-fog-dim">Confirm consent, then paste while this panel is focused.</span>
              </>
            )}
          </button>
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="mt-2 min-h-11 w-full rounded-lg border border-edge text-sm text-fog hover:text-paper"
            >
              Cancel extraction
            </button>
          ) : null}
        </div>
      ) : draft ? (
        <ReceiptEditor draft={draft} onDraft={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} />
      ) : (
        <ReceiptPaper receipt={parsed} currency={currency} />
      )}

      {receipt && parsed && !draft ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {receipt.confirmedAt ? (
              <Badge tone="lime">✓ human confirmed</Badge>
            ) : receipt.arithmeticIssues.length === 0 ? (
              <Badge tone="fog">arithmetic passes · confirmation required</Badge>
            ) : (
              <Badge tone="coral">{receipt.arithmeticIssues.length} arithmetic issue(s)</Badge>
            )}
            <Badge tone="fog">{receipt.attempts} extraction pass{receipt.attempts === 1 ? "" : "es"}</Badge>
          </div>
          <label className="flex min-h-11 items-start gap-2 rounded-lg border border-edge-soft bg-panel-2 p-3 text-sm text-fog">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy || locked}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-signal"
            />
            <span>
              I consent to sending the next replacement image to the configured vision provider for extraction.
            </span>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant="ghost" onClick={() => setDraft(structuredClone(parsed))} disabled={busy || locked}>
              Edit receipt
            </Button>
            <Button onClick={confirmReceipt} disabled={busy || locked || Boolean(receipt.confirmedAt)}>
              {receipt.confirmedAt ? "Confirmed" : "Confirm extraction"}
            </Button>
            <Button variant="ghost" onClick={() => inputRef.current?.click()} disabled={busy || locked || !consent}>
              Replace image
            </Button>
          </div>
        </div>
      ) : null}

      {receipt && receipt.arithmeticIssues.length > 0 ? (
        <ul className="mt-3 space-y-1" aria-live="polite">
          {receipt.arithmeticIssues.map((issue, index) => (
            <li key={`${issue}-${index}`} className="font-mono text-xs text-coral">{issue}</li>
          ))}
        </ul>
      ) : null}
      {qualityWarning ? (
        <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3" role="status">
          <p className="text-sm text-warn">{qualityWarning}</p>
        </div>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}
      {blocked ? <BlockedNote message={blocked} /> : null}
    </Panel>
  );
}

function ReceiptPaper({ receipt, currency }: { receipt: ParsedReceipt; currency: string }) {
  return (
    <div className="receipt-paper entry-rise relative mx-auto max-w-sm px-5 pb-6 pt-5 text-ink">
      <div className="text-center">
        <p className="font-mono text-sm font-bold uppercase tracking-widest">{receipt.merchant}</p>
        <p className="mt-1 font-mono text-xs text-ink-soft">{receipt.date ?? "date unknown"} · {receipt.currency}</p>
      </div>
      <div className="my-3 border-t border-dashed border-ink-soft/40" />
      <ul className="space-y-2">
        {receipt.items.map((item, index) => (
          <li key={`${item.description}-${index}`} className="flex items-baseline font-mono text-xs">
            <span className="shrink-0">{item.quantity > 1 ? `${item.quantity}× ` : ""}{item.description}</span>
            <span className="leader mx-1 min-w-4 flex-1" aria-hidden="true" />
            <span className="shrink-0 tabular-nums">{item.lineTotal}</span>
          </li>
        ))}
      </ul>
      <div className="my-3 border-t border-dashed border-ink-soft/40" />
      <div className="space-y-1 font-mono text-xs">
        {(["subtotal", "tax", "serviceCharge", "tip"] as const).map((key) =>
          receipt[key] !== null ? (
            <div key={key} className="flex justify-between">
              <span>{key === "serviceCharge" ? "Service" : key[0]!.toUpperCase() + key.slice(1)}</span>
              <span className="tabular-nums">{receipt[key]}</span>
            </div>
          ) : null,
        )}
        <div className="flex justify-between border-t border-ink-soft/40 pt-2 font-bold">
          <span>TOTAL {currency}</span><span className="tabular-nums">{receipt.total}</span>
        </div>
      </div>
      <div className="receipt-tear absolute -bottom-[10px] left-0 w-full" />
    </div>
  );
}

function ReceiptEditor({
  draft,
  onDraft,
  onSave,
  onCancel,
}: {
  draft: ParsedReceipt;
  onDraft: (receipt: ParsedReceipt) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const patchItem = (index: number, patch: Partial<ParsedReceipt["items"][number]>) => {
    const items = draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    onDraft(recalculate({ ...draft, items }));
  };
  const inputClass = "min-h-11 rounded-lg border border-edge bg-panel-2 px-3 text-base text-paper outline-none focus-visible:ring-2 focus-visible:ring-signal";

  return (
    <div className="space-y-4 rounded-xl border border-edge bg-panel-2 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-fog">Merchant
          <input className={`${inputClass} mt-1 w-full`} value={draft.merchant} onChange={(event) => onDraft({ ...draft, merchant: event.target.value })} />
        </label>
        <label className="text-sm text-fog">Currency
          <input className={`${inputClass} mt-1 w-full uppercase`} maxLength={3} value={draft.currency} onChange={(event) => onDraft({ ...draft, currency: event.target.value.toUpperCase() })} />
        </label>
      </div>
      <div className="space-y-3">
        {draft.items.map((item, index) => (
          <fieldset key={index} className="rounded-lg border border-edge-soft p-3">
            <legend className="px-1 font-mono text-xs text-fog">Item {index + 1}</legend>
            <label className="block text-sm text-fog">Description
              <input className={`${inputClass} mt-1 w-full`} value={item.description} onChange={(event) => patchItem(index, { description: event.target.value })} />
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]">
              <label className="text-sm text-fog">Qty
                <input type="number" min={1} max={999} className={`${inputClass} mt-1 w-full`} value={item.quantity} onChange={(event) => patchItem(index, { quantity: Math.max(1, Number(event.target.value) || 1) })} />
              </label>
              <label className="text-sm text-fog">Unit price
                <input inputMode="decimal" className={`${inputClass} mt-1 w-full`} value={item.unitPrice} onChange={(event) => patchItem(index, { unitPrice: event.target.value })} />
              </label>
              <button
                type="button"
                aria-label={`Delete item ${index + 1}`}
                disabled={draft.items.length === 1}
                onClick={() => onDraft(recalculate({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) }))}
                className="min-h-11 rounded-lg border border-coral/40 px-3 text-coral disabled:opacity-40 sm:mt-6"
              >
                Delete
              </button>
            </div>
            <p className="mt-2 text-right font-mono text-xs text-fog">Line total {item.lineTotal}</p>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onDraft({ ...draft, items: [...draft.items, { description: "New item", quantity: 1, unitPrice: "0.00", lineTotal: "0.00" }] })}
        className="min-h-11 w-full rounded-lg border border-dashed border-edge text-sm text-fog hover:border-signal hover:text-signal"
      >
        Add line item
      </button>
      <div className="grid gap-2 sm:grid-cols-3">
        {(["tax", "serviceCharge", "tip"] as const).map((key) => (
          <label key={key} className="text-sm text-fog">{key === "serviceCharge" ? "Service" : key[0]!.toUpperCase() + key.slice(1)}
            <input
              inputMode="decimal"
              className={`${inputClass} mt-1 w-full`}
              value={draft[key] ?? ""}
              placeholder="0.00"
              onChange={(event) => onDraft(recalculate({ ...draft, [key]: event.target.value || null }))}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg border border-edge-soft px-3 py-2 font-mono text-sm text-paper">
        <span>Recalculated total</span><span>{draft.currency} {draft.total}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={onSave}>Save corrections</Button>
      </div>
    </div>
  );
}
