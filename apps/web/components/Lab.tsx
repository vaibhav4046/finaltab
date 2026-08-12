"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentReviewLauncher, type AgentReviewGate } from "./AgentReviewLauncher";
import { ExecutionRail } from "./ExecutionRail";
import { ParticipantSetup } from "./ParticipantSetup";
import { ReceiptPanel } from "./ReceiptPanel";
import { SplitPanel } from "./SplitPanel";
import { invalidateReviewedSettlement, reviewedSettlementInputKey } from "@/lib/reviewGate";
import type { AllocationState, ExecutionStage, Person, ReceiptState } from "@/lib/types";
import type { DurableTabDraft } from "@/lib/tabDraft";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const [queryError, setQueryError] = useState<string | null>(null);
  const [newTabTitle, setNewTabTitle] = useState("");
  const [creatingTab, setCreatingTab] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);
  const [draftState, setDraftState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const draftContextRef = useRef<{
    tabId: string | null;
    revision: number;
    queue: Promise<void>;
  }>({ tabId: null, revision: 0, queue: Promise.resolve() });

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab !== null) {
      const normalizedTab = requestedTab.trim().toLowerCase();
      if (UUID_PATTERN.test(normalizedTab)) {
        setCloudTabId(normalizedTab);
      } else {
        setQueryError("This settlement URL does not contain a valid tab ID.");
      }
    }
    setQueryReady(true);
  }, []);

  useEffect(() => {
    if (!cloudTabId) return;
    let disposed = false;
    const draftContext = { tabId: cloudTabId, revision: 0, queue: Promise.resolve() };
    draftContextRef.current = draftContext;
    setParticipantsLoaded(false);
    setLocked(false);
    setDraftState("loading");
    setDraftMessage(null);
    void fetch(`/api/tabs/${cloudTabId}/draft`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as {
          tabStatus?: string;
          draft?: DurableTabDraft | null;
          message?: string;
        };
        if (!response.ok) throw new Error(body.message ?? "The durable draft could not be loaded.");
        if (disposed) return;
        if (body.tabStatus && body.tabStatus !== "open") {
          setLocked(true);
          setDraftState("ready");
          setDraftMessage("This tab is frozen. Its editable pre-freeze draft is hidden; use the execution history for immutable settlement truth.");
          return;
        }
        if (body.draft) {
          draftContext.revision = body.draft.revision;
          setReceipt(body.draft.receiptState);
          setAllocation(body.draft.allocationState);
          setPayerId(body.draft.payerParticipantId ?? "");
          setReview(invalidateReviewedSettlement());
          setNetted([]);
          setDraftMessage(body.draft.allocationState
            ? "Confirmed receipt and reconciled split restored from the durable tab."
            : "Confirmed receipt restored from the durable tab.");
        }
        setDraftState("ready");
      })
      .catch((error) => {
        if (disposed) return;
        setDraftState("error");
        setDraftMessage(error instanceof Error ? error.message : "The durable draft could not be loaded.");
      });
    return () => { disposed = true; };
  }, [cloudTabId]);

  const persistDraft = useCallback((
    nextReceipt: ReceiptState,
    nextAllocation: AllocationState | null,
    nextPayerId: string,
  ) => {
    if (!cloudTabId || !nextReceipt.confirmedAt || locked) return;
    const draftContext = draftContextRef.current;
    if (draftContext.tabId !== cloudTabId) return;
    const save = async () => {
      if (draftContextRef.current === draftContext) {
        setDraftState("saving");
        setDraftMessage("Saving confirmed draft…");
      }
      const response = await fetch(`/api/tabs/${draftContext.tabId}/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: draftContext.revision,
          receiptState: nextReceipt,
          allocationState: nextAllocation,
          payerParticipantId: nextPayerId || null,
        }),
      });
      const body = await response.json() as { revision?: number; message?: string };
      if (!response.ok || !Number.isSafeInteger(body.revision)) {
        throw new Error(body.message ?? "The confirmed draft could not be saved.");
      }
      draftContext.revision = body.revision!;
      if (draftContextRef.current !== draftContext) return;
      setDraftState("ready");
      setDraftMessage(nextAllocation
        ? "Confirmed receipt, payer, instruction, and reconciled split saved."
        : "Confirmed receipt draft saved.");
    };
    draftContext.queue = draftContext.queue.then(save, save).catch((error) => {
      if (draftContextRef.current !== draftContext) return;
      setDraftState("error");
      setDraftMessage(error instanceof Error ? error.message : "The confirmed draft could not be saved.");
    });
  }, [cloudTabId, locked]);

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
    if (!participantsLoaded) {
      setParticipantsLoaded(true);
      setPeople(next);
      setPayerId((current) => next.some((person) => person.id === current) ? current : (next[0]?.id ?? ""));
      return;
    }
    setPeople(next);
    const nextPayerId = next.some((person) => person.id === payerId) ? payerId : (next[0]?.id ?? "");
    if (nextPayerId !== payerId) setPayerId(nextPayerId);
    setAllocation(null);
    setReview(invalidateReviewedSettlement());
    setNetted([]);
    setStage("idle");
    if (receipt?.confirmedAt) persistDraft(receipt, null, nextPayerId);
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
  const editingLocked = locked || draftState === "loading";

  if (!queryReady) {
    return <div className="grid min-h-[55vh] place-items-center font-mono text-xs text-fog">Opening durable workspace…</div>;
  }

  if (queryError) {
    return (
      <div className="workspace-page grid min-h-[70vh] place-items-center py-10">
        <section className="surface-shadow w-full max-w-2xl rounded-2xl border border-danger/30 bg-surface-1 p-6 sm:p-8" aria-labelledby="invalid-tab-title">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-danger">Invalid settlement route</p>
          <h1 id="invalid-tab-title" className="mt-3 text-3xl font-semibold tracking-tight text-txt">This shared tab cannot be opened.</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{queryError} No remote record was requested and no local settlement state was created.</p>
          <Link href="/app" className="touch-target mt-5 inline-flex items-center rounded-xl bg-signal px-5 text-sm font-semibold text-ink">
            Return to shared tab history
          </Link>
        </section>
      </div>
    );
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
    <div className="workspace-page workspace-page-wide settlement-room-shell pb-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2 py-6">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-signal">SETTLEMENT ROOM</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-txt">
            Settle the table. Prove it onchain.
          </h1>
        </div>
        <p className="font-mono text-xs uppercase tracking-wider text-faint">
          Base Sepolia · USDC · KeeperHub execution
        </p>
      </header>

      <p
        className={`mb-4 rounded-xl border px-4 py-3 text-sm ${draftState === "error" ? "border-danger/30 bg-danger/5 text-danger" : "border-info/25 bg-info/5 text-muted"}`}
        role={draftState === "error" ? "alert" : "status"}
      >
        {draftState === "loading" ? "Loading confirmed receipt and split from this durable tab…" : draftMessage ?? "Confirmed receipt and split changes persist across signed-in devices."}
      </p>

      <ParticipantSetup
        people={people}
        locked={editingLocked}
        cloudTabId={cloudTabId}
        onPeople={resetAfterParticipantChange}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ReceiptPanel
          receipt={receipt}
          onReceipt={(next) => {
            if (locked) return;
            setReceipt(next);
            setAllocation(null);
            setReview(invalidateReviewedSettlement());
            setNetted([]);
            setStage("idle");
            if (next.confirmedAt) persistDraft(next, null, payerId);
          }}
          locked={editingLocked}
        />
        <SplitPanel
          people={people}
          receipt={receipt}
          allocation={allocation}
          payerId={payerId}
          locked={editingLocked}
          onPayer={(next) => {
            setPayerId(next);
            setAllocation(null);
            setReview(invalidateReviewedSettlement());
            setNetted([]);
            setStage("idle");
            if (receipt?.confirmedAt) persistDraft(receipt, null, next);
          }}
          onAllocation={(next) => {
            setAllocation(next);
            setReview(invalidateReviewedSettlement());
            setNetted([]);
            if (receipt?.confirmedAt && next) persistDraft(receipt, next, payerId);
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
        locked={editingLocked}
        review={review}
        onReviewed={setReview}
      />
    </div>
  );
}
