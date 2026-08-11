"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, ExternalLink, LockKeyhole } from "lucide-react";
import type { ReviewedSettlementBinding } from "@/lib/reviewGate";
import type { AllocationState, ReceiptState } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AgentReviewGate = ReviewedSettlementBinding;

interface Props {
  cloudTabId: string | null;
  receipt: ReceiptState | null;
  allocation: AllocationState | null;
  payerParticipantId: string;
  reviewInputKey: string;
  locked: boolean;
  review: AgentReviewGate | null;
  onReviewed: (review: AgentReviewGate) => void;
}

export function AgentReviewLauncher({
  cloudTabId,
  receipt,
  allocation,
  payerParticipantId,
  reviewInputKey,
  locked,
  review,
  onReviewed,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRunUrl, setLastRunUrl] = useState<string | null>(null);
  const inputKeyRef = useRef(reviewInputKey);
  const requestRef = useRef<AbortController | null>(null);
  inputKeyRef.current = reviewInputKey;

  useEffect(() => {
    requestRef.current?.abort();
    if (!review) {
      setMessage(null);
      setLastRunUrl(null);
    }
    return () => requestRef.current?.abort();
  }, [allocation, cloudTabId, payerParticipantId, receipt, review, reviewInputKey]);

  const ready = Boolean(
    cloudTabId &&
    receipt?.confirmedAt &&
    allocation &&
    payerParticipantId,
  );

  const run = async () => {
    if (!cloudTabId || !receipt?.confirmedAt || !allocation || !payerParticipantId || busy) return;
    const requestedInputKey = reviewInputKey;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/agents/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          tabId: cloudTabId,
          receipt: receipt.receipt,
          receiptConfirmed: true,
          payerParticipantId,
          instruction: allocation.instruction,
          extractionProvider: receipt.provider,
          extractionAttempts: receipt.attempts,
          existingProposal: allocation.proposal,
        }),
      });
      const body = await response.json() as {
        runUrl?: string;
        message?: string;
        deduped?: boolean;
        run?: {
          id?: unknown;
          status?: unknown;
          inputHash?: unknown;
          terminalCode?: unknown;
          resultSummary?: { receiptId?: unknown; allocationId?: unknown };
        };
      };
      if (!response.ok || !body.runUrl || !body.run) {
        throw new Error(body.message ?? "Settlement review could not be committed.");
      }
      if (requestedInputKey !== inputKeyRef.current) {
        setMessage("Inputs changed while the review was running. Run the review again for the current plan.");
        return;
      }
      setLastRunUrl(body.runUrl);
      const runId = body.run.id;
      const status = body.run.status;
      const inputHash = body.run.inputHash;
      const durableReceiptId = body.run.resultSummary?.receiptId;
      const allocationId = body.run.resultSummary?.allocationId;
      if (
        typeof runId !== "string" || !UUID_RE.test(runId) ||
        (status !== "ready" && status !== "verified") ||
        typeof inputHash !== "string" || !/^[0-9a-f]{64}$/.test(inputHash) ||
        typeof durableReceiptId !== "string" || !UUID_RE.test(durableReceiptId) ||
        typeof allocationId !== "string" || !UUID_RE.test(allocationId)
      ) {
        setMessage(`Review did not unlock signing (${String(body.run.terminalCode ?? status)}). Inspect its evidence before continuing.`);
        return;
      }
      onReviewed({ runId, status, durableReceiptId, allocationId, inputHash, inputKey: requestedInputKey });
      setMessage(body.deduped
        ? "Identical attested inputs reused. Signing is unlocked for this exact receipt and allocation."
        : "Pre-signature review passed. Proof remains not submitted; signing is unlocked for these exact inputs.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage(error instanceof Error ? error.message : "Settlement review could not be committed.");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-info/30 bg-surface-1" aria-labelledby="agent-review-title">
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-info/30 bg-info/10 text-info"><Bot size={21} aria-hidden="true" /></span>
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-info">Durable agent review</p>
            <h2 id="agent-review-title" className="mt-1 text-xl font-semibold text-txt">Commit the invariants before signatures</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">The confirmed receipt and existing structured proposal are hashed once, stored under your authenticated tab, and checked by four bounded stages. Identical inputs reuse the same run and spend no additional model tokens.</p>
          </div>
        </div>
        <button
          type="button"
          disabled={!ready || busy || locked}
          onClick={() => void run()}
          className="touch-target inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" aria-hidden="true" /> Reviewing…</> : <><CheckCircle2 size={17} aria-hidden="true" /> Run 4-stage review</>}
        </button>
      </div>
      {!cloudTabId ? <p className="flex items-center gap-2 border-t border-quiet-soft bg-canvas/40 px-5 py-3 text-sm text-warn"><LockKeyhole size={15} aria-hidden="true" /> Open or create a signed-in shared tab to get tenant-isolated runs and memory.</p> : !receipt?.confirmedAt ? <p className="border-t border-quiet-soft bg-canvas/40 px-5 py-3 text-sm text-muted">Confirm the receipt first.</p> : !allocation ? <p className="border-t border-quiet-soft bg-canvas/40 px-5 py-3 text-sm text-muted">Create a reconciled allocation first.</p> : null}
      {message ? <p className="border-t border-quiet-soft px-5 py-3 text-sm text-info" role="status">{message}</p> : null}
      {review || lastRunUrl ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-quiet-soft bg-canvas/40 px-5 py-3"><p className="font-mono text-xs text-muted">{review ? `${review.status} · run ${review.runId.slice(0, 8)}` : "Review evidence available"}</p><Link href={review ? `/app/agents/${review.runId}` : lastRunUrl!} className="touch-target inline-flex items-center gap-2 text-sm font-semibold text-info">Inspect run <ExternalLink size={14} aria-hidden="true" /></Link></div> : null}
    </section>
  );
}
