"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  CircleDashed,
  Database,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { AgentMemoryGraph } from "@/components/AgentMemoryGraph";
import type {
  SettlementAgentEvent,
  SettlementAgentMemory,
  SettlementAgentRun,
  SettlementAgentRunDetail,
  SettlementBalanceRow,
} from "@/lib/agentControl";

interface Props {
  runId?: string;
}

const STAGE_COPY: Record<string, { title: string; copy: string }> = {
  extraction_validation: {
    title: "Extraction validator",
    copy: "Schema, currency and receipt arithmetic; only a human-confirmed record can pass.",
  },
  allocation_arithmetic: {
    title: "Allocation reconciler",
    copy: "The model may map language to item indices. Bigint conservation decides the result.",
  },
  consent_risk: {
    title: "Consent & risk",
    copy: "Base Sepolia, USD, wallet uniqueness, contract and debit/payout invariants.",
  },
  proof_verification: {
    title: "Proof verifier",
    copy: "Pre-signature runs stay not submitted. The Proofs flow verifies only after an exact settlement, ledger and contract binding exists.",
  },
};

function tone(status: string): string {
  if (status === "verified" || status === "ready" || status === "passed") return "border-verified/35 bg-verified/10 text-verified";
  if (status === "blocked" || status === "failed") return "border-danger/35 bg-danger/10 text-danger";
  if (status === "skipped") return "border-warn/35 bg-warn/10 text-warn";
  return "border-info/30 bg-info/10 text-info";
}

function money(minor: string, currency: string): string {
  const amount = BigInt(minor || "0");
  const sign = amount < 0n ? "−" : "";
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${currency} ${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

function balanceRows(run: SettlementAgentRunDetail): SettlementBalanceRow[] {
  const value = run.resultSummary.balanceSheet;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): SettlementBalanceRow[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (
      typeof row.participantId !== "string" ||
      typeof row.displayName !== "string" ||
      typeof row.shareMinor !== "string" ||
      typeof row.paidMinor !== "string" ||
      typeof row.netMinor !== "string"
    ) return [];
    return [row as unknown as SettlementBalanceRow];
  });
}

function EventCard({ event }: { event: SettlementAgentEvent }) {
  const copy = STAGE_COPY[event.stage];
  const output = event.outputSummary;
  const facts = Object.entries(output).filter(([, value]) =>
    typeof value === "string" || typeof value === "number" || typeof value === "boolean",
  ).slice(0, 6);
  return (
    <li className="stage-swap rounded-2xl border border-quiet-soft bg-surface-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-faint">Stage 0{event.sequence}</p>
          <h3 className="mt-1 font-semibold text-txt">{copy?.title ?? event.stage}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{copy?.copy}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wide ${tone(event.status)}`}>
          {event.status}
        </span>
      </div>
      {facts.length > 0 ? (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {facts.map(([key, value]) => (
            <div key={key} className="rounded-xl border border-quiet-soft bg-canvas/40 px-3 py-2">
              <dt className="font-mono text-xs uppercase tracking-wide text-faint">{key.replaceAll(/([A-Z])/g, " $1")}</dt>
              <dd className="mt-1 break-words font-mono text-xs text-txt">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-3 font-mono text-xs text-faint">
        {event.durationMs} ms · input {event.inputHash.slice(0, 12)}…
        {event.modelName ? ` · ${event.modelProvider}/${event.modelName}` : " · deterministic only"}
      </p>
    </li>
  );
}

export function AgentControlCenter({ runId }: Props) {
  const [availability, setAvailability] = useState<"loading" | "disabled" | "signed-out" | "ready" | "error">("loading");
  const [runs, setRuns] = useState<SettlementAgentRun[]>([]);
  const [selected, setSelected] = useState<SettlementAgentRunDetail | null>(null);
  const [graphRun, setGraphRun] = useState<SettlementAgentRunDetail | null>(null);
  const [graphIssue, setGraphIssue] = useState<string | null>(null);
  const [memory, setMemory] = useState<SettlementAgentMemory[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"info" | "error">("info");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMessage(null);
    setMessageKind("info");
    setGraphIssue(null);
    setConfirmingDelete(null);
    try {
      const sessionRequest = fetch("/api/session", { cache: "no-store" });
      const requests: Promise<Response>[] = [
        fetch("/api/agents/runs?limit=30", { cache: "no-store" }),
        fetch("/api/agents/memory", { cache: "no-store" }),
      ];
      if (runId) requests.push(fetch(`/api/agents/runs/${encodeURIComponent(runId)}`, { cache: "no-store" }));
      const [sessionResponse, ...responses] = await Promise.all([sessionRequest, ...requests]);
      const session = await sessionResponse.json() as { configured?: boolean; authenticated?: boolean };
      if (!session.configured) { setAvailability("disabled"); return; }
      if (!session.authenticated) { setAvailability("signed-out"); return; }
      const bodies = await Promise.all(responses.map((response) => response.json())) as Array<Record<string, unknown>>;
      if (!responses[0]!.ok || !responses[1]!.ok || (responses[2] && !responses[2]!.ok)) {
        throw new Error(String(bodies.find((body) => typeof body.message === "string")?.message ?? "Agent control data could not be loaded."));
      }
      const loadedRuns = (bodies[0]!.runs ?? []) as SettlementAgentRun[];
      const loadedSelected = runId ? (bodies[2]!.run as SettlementAgentRunDetail) : null;
      setRuns(loadedRuns);
      setMemory((bodies[1]!.memory ?? []) as SettlementAgentMemory[]);
      setSelected(loadedSelected);
      setGraphRun(loadedSelected);

      if (!loadedSelected && loadedRuns[0]) {
        try {
          const graphResponse = await fetch(`/api/agents/runs/${encodeURIComponent(loadedRuns[0].id)}`, { cache: "no-store" });
          const graphBody = await graphResponse.json() as { run?: SettlementAgentRunDetail; message?: string };
          if (!graphResponse.ok || !graphBody.run) {
            throw new Error(graphBody.message ?? "The latest run detail could not be loaded.");
          }
          setGraphRun(graphBody.run);
        } catch (error) {
          setGraphRun(null);
          setGraphIssue(error instanceof Error ? error.message : "The latest run detail could not be loaded.");
        }
      }
      setAvailability("ready");
    } catch (error) {
      setAvailability("error");
      setMessageKind("error");
      setGraphRun(null);
      setMessage(error instanceof Error ? error.message : "Agent control data could not be loaded.");
    }
  }, [runId]);

  useEffect(() => { void load(); }, [load]);

  const deleteMemory = async (id: string) => {
    setDeleting(id);
    setMessage(null);
    setMessageKind("info");
    try {
      const response = await fetch(`/api/agents/memory/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? body.error ?? `Memory deletion failed with status ${response.status}.`);
      }
      setMemory((current) => current.filter((entry) => entry.id !== id));
      setSelected((current) => current ? { ...current, memory: current.memory.filter((entry) => entry.id !== id) } : current);
      setGraphRun((current) => current ? { ...current, memory: current.memory.filter((entry) => entry.id !== id) } : current);
      setConfirmingDelete(null);
      setMessage("Memory removed from this view. The append-only tab audit keeps its digest and deletion event.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Memory could not be deleted.");
    } finally {
      setDeleting(null);
    }
  };

  const balanceSheet = useMemo(() => selected ? balanceRows(selected) : [], [selected]);
  const pendingMemory = useMemo(
    () => memory.find((entry) => entry.id === confirmingDelete) ?? null,
    [confirmingDelete, memory],
  );
  const currency = selected && typeof selected.resultSummary.currency === "string" ? selected.resultSummary.currency : "USD";

  if (availability === "loading") {
    return <div className="grid min-h-[60vh] place-items-center" role="status"><span className="inline-flex items-center gap-2 text-sm text-muted"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Loading bounded agent records…</span></div>;
  }
  if (availability === "disabled") {
    return <div className="mx-auto max-w-3xl px-4 py-16"><ShieldAlert className="text-warn" aria-hidden="true" /><h1 className="mt-4 text-3xl font-semibold text-txt">Agent control is fail-closed</h1><p className="mt-3 leading-7 text-muted">Supabase is not configured, so FINALTab will not invent durable runs or memory.</p></div>;
  }
  if (availability === "signed-out") {
    return <div className="mx-auto max-w-3xl px-4 py-16"><LockKeyhole className="text-info" aria-hidden="true" /><h1 className="mt-4 text-3xl font-semibold text-txt">Sign in to inspect your agents</h1><p className="mt-3 leading-7 text-muted">Runs and memory are private to their authenticated owner and tab.</p><Link href={`/auth?next=${encodeURIComponent(runId ? `/app/agents/${runId}` : "/app/agents")}`} className="touch-target mt-6 inline-flex items-center rounded-xl bg-signal px-5 text-sm font-semibold text-ink">Continue to sign in</Link></div>;
  }

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="relative overflow-hidden rounded-3xl border border-quiet-soft bg-surface-1 p-6 sm:p-8">
        <div className="ledger-grid absolute inset-0" aria-hidden="true" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-signal">Bounded settlement intelligence</p>
            <h1 className="display-type mt-3 text-4xl text-txt sm:text-5xl">Agents that leave evidence.</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted">Four fixed stages validate the receipt, reconcile every unit, check consent risk and keep proof pending until an exact submission exists. Runs cannot loop, rewrite code or silently expand their own permissions.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-quiet bg-canvas/70 p-4"><p className="font-mono text-xs uppercase text-faint">Max stages</p><p className="mt-2 text-2xl font-semibold text-signal">4</p></div>
            <div className="rounded-2xl border border-quiet bg-canvas/70 p-4"><p className="font-mono text-xs uppercase text-faint">Live adapter</p><p className="mt-2 text-sm font-semibold text-info">Base Sepolia</p></div>
          </div>
        </div>
      </header>

      {message ? <p className={`mt-4 rounded-xl border p-3 text-sm ${messageKind === "error" ? tone("failed") : "border-info/30 bg-info/10 text-info"}`} role={messageKind === "error" ? "alert" : "status"}>{message}</p> : null}

      <AgentMemoryGraph
        run={selected ?? graphRun}
        hasRuns={runs.length > 0}
        firstRunId={runs[0]?.id}
        detailIssue={graphIssue}
      />

      {selected ? (
        <>
          <section className="mt-8 rounded-3xl border border-quiet-soft bg-surface-1 p-5 sm:p-6" aria-labelledby="run-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><Link href="/app/agents" className="font-mono text-xs uppercase tracking-wide text-info hover:text-txt">← All runs</Link><h2 id="run-title" className="mt-3 text-2xl font-semibold text-txt">Run {selected.id.slice(0, 8)}</h2><p className="mt-2 font-mono text-xs text-faint">{selected.inputHash} · created {new Date(selected.createdAt).toLocaleString()}</p></div>
              <span className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wide ${tone(selected.status)}`}>{selected.status}</span>
            </div>
            <ol className="mt-6 grid gap-3 lg:grid-cols-2">{selected.events.map((event) => <EventCard key={event.id} event={event} />)}</ol>
          </section>

          <section className="mt-6 rounded-3xl border border-quiet-soft bg-surface-1 p-5 sm:p-6" aria-labelledby="balance-title">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-info">Confirmed allocation</p><h2 id="balance-title" className="mt-2 text-2xl font-semibold text-txt">Balance sheet</h2></div><p className="text-sm text-muted">Paid − share = net position. No cross-chain or invented balance data.</p></div>
            {balanceSheet.length > 0 ? <div className="mt-5 overflow-x-auto rounded-2xl border border-quiet-soft"><table className="min-w-full text-left text-sm"><thead className="bg-canvas/70 font-mono text-xs uppercase tracking-wide text-faint"><tr><th className="px-4 py-3">Participant</th><th className="px-4 py-3 text-right">Share</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3">Approval</th></tr></thead><tbody>{balanceSheet.map((row) => <tr key={row.participantId} className="border-t border-quiet-soft"><td className="px-4 py-3"><p className="font-medium text-txt">{row.displayName}</p><p className="mt-1 font-mono text-xs text-faint">{row.walletAddress ? `${row.walletAddress.slice(0, 8)}…${row.walletAddress.slice(-6)}` : "wallet missing"}</p></td><td className="px-4 py-3 text-right font-mono text-txt">{money(row.shareMinor, currency)}</td><td className="px-4 py-3 text-right font-mono text-txt">{money(row.paidMinor, currency)}</td><td className={`px-4 py-3 text-right font-mono font-semibold ${row.position === "receivable" ? "text-verified" : row.position === "payable" ? "text-warn" : "text-muted"}`}>{money(row.netMinor, currency)}</td><td className="px-4 py-3 text-muted">{row.approvalState.replaceAll("_", " ")}</td></tr>)}</tbody></table></div> : <p className="mt-5 rounded-2xl border border-dashed border-quiet p-6 text-sm text-muted">No confirmed conserved allocation was committed for this run.</p>}
          </section>
        </>
      ) : (
        <section className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div>
            <div className="flex items-end justify-between gap-3"><div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-info">Audit ledger</p><h2 className="mt-2 text-2xl font-semibold text-txt">Recent runs</h2></div><button type="button" onClick={() => void load()} className="touch-target inline-flex items-center gap-2 rounded-xl border border-quiet px-3 text-sm text-muted hover:text-txt"><RefreshCw size={15} aria-hidden="true" /> Refresh</button></div>
            <div className="mt-4 space-y-3">{runs.map((run) => <Link key={run.id} href={`/app/agents/${run.id}`} className="group block rounded-2xl border border-quiet-soft bg-surface-1 p-4 transition-colors hover:border-info/50"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl border border-quiet bg-surface-2 text-info">{run.status === "running" ? <CircleDashed size={19} className="animate-spin" aria-hidden="true" /> : <Bot size={19} aria-hidden="true" />}</span><div><p className="font-medium text-txt">Run {run.id.slice(0, 8)}</p><p className="mt-1 font-mono text-xs text-faint">{new Date(run.createdAt).toLocaleString()} · {run.stageCount}/4 stages</p></div></div><span className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase ${tone(run.status)}`}>{run.status}</span></div><div className="mt-3 flex items-center justify-between gap-3"><p className="truncate font-mono text-xs text-muted">{run.terminalCode ?? run.inputHash}</p><ExternalLink size={15} className="shrink-0 text-info transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></div></Link>)}{runs.length === 0 ? <div className="rounded-2xl border border-dashed border-quiet bg-surface-1 p-8 text-center"><Bot size={24} className="mx-auto text-muted" aria-hidden="true" /><p className="mt-4 font-medium text-txt">No durable runs yet</p><p className="mt-2 text-sm text-muted">Open a signed-in shared settlement, confirm the receipt and allocation, then run the review.</p><Link href="/app/tab" className="touch-target mt-5 inline-flex items-center rounded-xl bg-signal px-5 text-sm font-semibold text-ink">Open settlement room</Link></div> : null}</div>
          </div>

          <aside>
            <div className="flex items-center gap-2"><Database size={18} className="text-signal" aria-hidden="true" /><h2 className="text-xl font-semibold text-txt">Bounded audit memory</h2></div>
            <p className="mt-2 text-sm leading-6 text-muted">Only compact invariant summaries are retained for audit and comparison. They never change policy, alter code, or enter a model prompt, and you can delete them at any time.</p>
            <div className="mt-4 space-y-3">{memory.map((entry) => <article key={entry.id} className="rounded-2xl border border-quiet-soft bg-surface-1 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-wide text-signal">revision {entry.revision}</p><h3 className="mt-1 font-medium text-txt">Latest settlement review</h3></div><button type="button" disabled={deleting !== null} onClick={() => setConfirmingDelete(entry.id)} className="touch-target grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50" aria-label="Review deletion of this memory"><Trash2 size={17} aria-hidden="true" /></button></div><p className="mt-3 font-mono text-xs text-muted">{entry.contentHash.slice(0, 18)}…</p><p className="mt-2 text-xs text-faint">Expires {new Date(entry.expiresAt).toLocaleDateString()}</p>{entry.sourceRunId ? <Link href={`/app/agents/${entry.sourceRunId}`} className="touch-target mt-3 inline-flex items-center gap-2 text-sm font-semibold text-info">Inspect source run <ExternalLink size={14} aria-hidden="true" /></Link> : null}</article>)}{memory.length === 0 ? <div className="rounded-2xl border border-dashed border-quiet p-5 text-sm text-muted">No retained memory.</div> : null}</div>
            {pendingMemory ? (
              <div className="mt-4 rounded-2xl border border-danger/35 bg-danger/10 p-4" role="region" aria-labelledby={`memory-delete-${pendingMemory.id}`} aria-busy={deleting === pendingMemory.id}>
                <p id={`memory-delete-${pendingMemory.id}`} className="font-semibold text-txt">Remove bounded memory revision {pendingMemory.revision}?</p>
                <p className="mt-2 text-sm leading-6 text-muted">This removes the compact summary from the product. The append-only tab audit keeps the digest and deletion event.</p>
                <p className="mt-3 break-all font-mono text-xs text-faint" title={pendingMemory.contentHash}>{pendingMemory.contentHash}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={deleting !== null} onClick={() => setConfirmingDelete(null)} className="touch-target inline-flex items-center rounded-xl border border-quiet px-4 text-sm font-semibold text-muted hover:text-txt disabled:opacity-50">Keep memory</button>
                  <button type="button" disabled={deleting !== null} onClick={() => void deleteMemory(pendingMemory.id)} className="touch-target inline-flex items-center rounded-xl border border-danger/40 bg-danger/15 px-4 text-sm font-semibold text-danger hover:bg-danger/20 disabled:opacity-50">
                    {deleting === pendingMemory.id ? "Removing…" : "Remove memory"}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-4 rounded-2xl border border-info/25 bg-info/5 p-4"><div className="flex items-center gap-2 text-info"><CheckCircle2 size={17} aria-hidden="true" /><p className="font-semibold">Measured, not magical</p></div><p className="mt-2 text-sm leading-6 text-muted">The control plane reports reconciler conservation and wallet/consent gates, then says proof not submitted until the independent verifier has an exact binding. It does not claim self-modifying code or unsupported networks.</p></div>
          </aside>
        </section>
      )}
    </div>
  );
}
