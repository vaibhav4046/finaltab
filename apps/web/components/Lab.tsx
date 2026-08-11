"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentReviewLauncher, type AgentReviewGate } from "./AgentReviewLauncher";
import { ExecutionRail } from "./ExecutionRail";
import { ParticipantSetup } from "./ParticipantSetup";
import { ReceiptPanel } from "./ReceiptPanel";
import { SplitPanel } from "./SplitPanel";
import { invalidateReviewedSettlement, reviewedSettlementInputKey } from "@/lib/reviewGate";
import type { AllocationState, ExecutionStage, Person, ReceiptState } from "@/lib/types";

export function Lab() {
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([]);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [payerId, setPayerId] = useState("");
  const [allocation, setAllocation] = useState<AllocationState | null>(null);
  const [review, setReview] = useState<AgentReviewGate | null>(null);
  const [netted, setNetted] = useState<Array<{ debtor: string; creditor: string; usdcMinor: string }>>([]);
  const [stage, setStage] = useState<ExecutionStage>("idle");
  const [locked, setLocked] = useState(false);
  const [cloudTabId, setCloudTabId] = useState<string | null>(null);
  const [queryReady, setQueryReady] = useState(false);
  const [newTabTitle, setNewTabTitle] = useState("");
  const [creatingTab, setCreatingTab] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab) setCloudTabId(requestedTab);
    setQueryReady(true);
  }, []);

  const createDurableTab = async () => {
    const title = newTabTitle.trim();
    if (!title || creatingTab) return;
    setCreatingTab(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/tabs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, currency: "USD" }),
      });
      const body = await response.json() as { tab?: { id?: string }; message?: string };
      const tabId = body.tab?.id;
      if (!response.ok || !tabId) throw new Error(body.message ?? "The durable tab could not be created.");
      setCloudTabId(tabId);
      router.replace(`/app/tab?tab=${encodeURIComponent(tabId)}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "The durable tab could not be created.");
    } finally {
      setCreatingTab(false);
    }
  };

  const resetAfterParticipantChange = (next: Person[]) => {
    if (locked) return;
    setPeople(next);
    if (!next.some((person) => person.id === payerId)) setPayerId(next[0]?.id ?? "");
    setAllocation(null);
    setReview(invalidateReviewedSettlement());
    setNetted([]);
    setStage("idle");
  };

  const reviewInputKey = reviewedSettlementInputKey({
    tabId: cloudTabId,
    people,
    receipt,
    payerParticipantId: payerId,
    allocation,
    netted,
    currency: receipt?.receipt.currency ?? "",
  });

  if (!queryReady) {
    return <div className="grid min-h-[55vh] place-items-center font-mono text-xs text-fog">Opening durable workspace…</div>;
  }

  if (!cloudTabId) {
    return (
      <div className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 sm:px-6">
        <section className="surface-shadow w-full overflow-hidden rounded-3xl border border-quiet-soft bg-surface-1" aria-labelledby="durable-tab-title">
          <div className="border-b border-quiet-soft bg-surface-2/50 p-6 sm:p-8">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-signal">Durable settlement required</p>
            <h1 id="durable-tab-title" className="mt-3 text-3xl font-semibold tracking-tight text-txt">Create the shared tab before touching money.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Receipt state, participants, agent evidence, consent, and proof must belong to an authenticated Supabase tab. FINALTab will not open an unsaved settlement room.
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-[1fr_100px_auto] sm:items-end">
              <label className="text-sm text-muted">Tab name
                <input
                  value={newTabTitle}
                  onChange={(event) => setNewTabTitle(event.target.value)}
                  maxLength={80}
                  placeholder="Team dinner · 11 Aug"
                  disabled={creatingTab}
                  className="mt-1 min-h-11 w-full rounded-xl border border-quiet bg-surface-2 px-3 text-base text-txt outline-none focus-visible:ring-2 focus-visible:ring-signal"
                />
              </label>
              <label className="text-sm text-muted">Currency
                <input readOnly value="USD" className="mt-1 min-h-11 w-full rounded-xl border border-quiet bg-surface-2 px-3 font-mono text-sm text-txt" />
              </label>
              <button
                type="button"
                onClick={() => void createDurableTab()}
                disabled={creatingTab || !newTabTitle.trim()}
                className="touch-target rounded-xl bg-signal px-5 text-sm font-semibold text-ink disabled:opacity-45"
              >
                {creatingTab ? "Creating…" : "Create and open"}
              </button>
            </div>
            {createError ? <p className="mt-3 text-sm text-coral" role="alert">{createError}</p> : null}
            <p className="mt-4 text-xs leading-5 text-muted">Already have a tab? <Link href="/app" className="font-semibold text-info hover:text-txt">Open it from Shared tab history.</Link></p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="settlement-room-shell mx-auto max-w-[1400px] px-4 pb-10 md:px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2 py-6">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-signal">SETTLEMENT ROOM</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-txt">
            Settle the table. Prove it onchain.
          </h1>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-faint">
          Base Sepolia · USDC · KeeperHub execution
        </p>
      </header>

      <ParticipantSetup
        people={people}
        locked={locked}
        cloudTabId={cloudTabId}
        onPeople={resetAfterParticipantChange}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReceiptPanel
          receipt={receipt}
          onReceipt={(next) => {
            if (locked) return;
            setReceipt(next);
            setAllocation(null);
            setReview(invalidateReviewedSettlement());
            setNetted([]);
            setStage("idle");
          }}
          locked={locked}
        />
        <SplitPanel
          people={people}
          receipt={receipt}
          allocation={allocation}
          payerId={payerId}
          locked={locked}
          onPayer={(next) => {
            setPayerId(next);
            setReview(invalidateReviewedSettlement());
          }}
          onAllocation={(next) => {
            setAllocation(next);
            setReview(invalidateReviewedSettlement());
            setNetted([]);
          }}
          onNetted={setNetted}
        />
        <ExecutionRail
          cloudTabId={cloudTabId}
          people={people}
          netted={netted}
          review={review}
          reviewInputKey={reviewInputKey}
          currency={receipt?.receipt.currency ?? ""}
          stage={stage}
          onStage={setStage}
          onLocked={setLocked}
        />
      </div>

      <AgentReviewLauncher
        cloudTabId={cloudTabId}
        receipt={receipt}
        allocation={allocation}
        payerParticipantId={payerId}
        reviewInputKey={reviewInputKey}
        locked={locked}
        review={review}
        onReviewed={setReview}
      />
    </div>
  );
}
