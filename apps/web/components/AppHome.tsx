"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Signature,
  Users,
  type LucideIcon,
} from "lucide-react";
import { loadHistory, loadProfile, type Profile, type TabRecord } from "@/lib/identity";
import { CloudTabsPanel } from "./CloudTabsPanel";

const VERDICT_TONE: Record<TabRecord["verdict"], string> = {
  VERIFIED_SETTLED: "border-verified/35 bg-verified/10 text-verified",
  SIMULATED: "border-info/35 bg-info/10 text-info",
  FAILED: "border-danger/35 bg-danger/10 text-danger",
  DRAFT: "border-quiet bg-surface-2 text-muted",
};

const PRODUCT_ROUTE: Array<{
  title: string;
  status: string;
  copy: string;
  icon: LucideIcon;
  tone: string;
}> = [
  { title: "Scan", status: "Available", copy: "Upload a receipt", icon: ScanLine, tone: "text-signal" },
  { title: "Confirm", status: "Review", copy: "Inspect the extraction", icon: CircleCheck, tone: "text-info" },
  { title: "Invite", status: "Account gated", copy: "Expiring, single-use cloud links", icon: Users, tone: "text-info" },
  { title: "Sign", status: "Wallet required", copy: "Only the exact debtor wallet approves", icon: Signature, tone: "text-warn" },
  { title: "Settle", status: "Testnet", copy: "KeeperHub on Base Sepolia", icon: ShieldCheck, tone: "text-verified" },
];

function formatFiatMinor(minor: string, currency: string): string {
  const n = Number(minor);
  if (!Number.isFinite(n)) return `${currency} —`;
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${(n / 100).toFixed(2)}`;
}

function verdictLabel(verdict: TabRecord["verdict"]): string {
  return verdict.toLowerCase().replace(/_/g, " ");
}

export function AppHome() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<TabRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setHistory(loadHistory());
    setMounted(true);
  }, []);

  const unsettled = history.filter((tab) => tab.verdict === "DRAFT" || tab.verdict === "SIMULATED");
  const verifiedCount = history.filter((tab) => tab.verdict === "VERIFIED_SETTLED").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <section className="surface-shadow relative overflow-hidden rounded-3xl border border-quiet-soft bg-surface-1 p-6 sm:p-8 lg:p-10" aria-labelledby="workspace-title">
        <div className="ledger-grid absolute inset-0" aria-hidden="true" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-signal">Settlement desk</p>
            <h1 id="workspace-title" className="display-type mt-4 max-w-3xl text-4xl leading-[1.02] text-txt sm:text-5xl">
              {mounted && profile ? `Welcome back, ${profile.name}.` : "Turn the receipt into a receipt."}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Scan, inspect and allocate together. Signed-in groups can resume durable drafts across devices; money still moves only after each exact debtor wallet approves the frozen plan.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/app/tab" className="touch-target inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-ink transition-[transform,background-color] duration-200 hover:bg-[#ffa581] active:scale-[0.98]">
                {unsettled.length > 0 ? "Resume in settlement room" : "Start with a receipt"}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/app/proof" className="touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-quiet bg-surface-2 px-5 text-sm font-semibold text-txt transition-colors hover:border-info/50 hover:text-info">
                Inspect reference proof <FileCheck2 size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="grid min-w-[220px] grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-quiet bg-canvas/70 p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-faint">On this device</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-txt">{mounted ? history.length : "—"}</p>
              <p className="mt-1 text-sm text-muted">saved tab{history.length === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-2xl border border-verified/25 bg-verified/5 p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-faint">Verified</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-verified">{mounted ? verifiedCount : "—"}</p>
              <p className="mt-1 text-sm text-muted">local record{verifiedCount === 1 ? "" : "s"}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="route-heading">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-info">Product route</p>
            <h2 id="route-heading" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-txt">What works at each step</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted">Status labels describe this deployment, not a future roadmap presented as finished.</p>
        </div>

        <ol className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Settlement journey and availability">
          {PRODUCT_ROUTE.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="surface-shadow rounded-2xl border border-quiet-soft bg-surface-1 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl border border-quiet bg-surface-2 ${step.tone}`}><Icon size={20} aria-hidden="true" /></span>
                  <span className="font-mono text-xs text-faint">0{index + 1}</span>
                </div>
                <h3 className="mt-5 font-semibold text-txt">{step.title}</h3>
                <p className={`mt-1 text-xs font-semibold uppercase tracking-wide ${step.tone}`}>{step.status}</p>
                <p className="mt-3 text-sm leading-6 text-muted">{step.copy}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <CloudTabsPanel />

      <section className="mt-10 grid gap-4 md:grid-cols-3" aria-label="Workspace shortcuts">
        <Link href="/app/tab" className="group touch-target surface-shadow rounded-2xl border border-signal/30 bg-surface-1 p-5 transition-colors hover:border-signal/60">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-signal/10 text-signal"><ReceiptText size={22} aria-hidden="true" /></span>
          <h2 className="mt-6 text-lg font-semibold text-txt">Settlement room</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Receipt extraction, exact allocation, test signatures and KeeperHub execution in one workspace.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-signal">Open room <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
        </Link>
        <Link href="/app/proof" className="group touch-target surface-shadow rounded-2xl border border-quiet-soft bg-surface-1 p-5 transition-colors hover:border-info/50">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-info/10 text-info"><FileCheck2 size={22} aria-hidden="true" /></span>
          <h2 className="mt-6 text-lg font-semibold text-txt">Reference capsule</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Inspect the committed proof record for the agent-driven Base Sepolia reference flight.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-info">Inspect proof <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
        </Link>
        <Link href="/lab" className="group touch-target surface-shadow rounded-2xl border border-quiet-soft bg-surface-1 p-5 transition-colors hover:border-danger/50">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-danger/10 text-danger"><FlaskConical size={22} aria-hidden="true" /></span>
          <h2 className="mt-6 text-lg font-semibold text-txt">Reliability lab</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Inject expiry, tampering and replay failures and watch the deterministic checks block them.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-danger">Run failure tests <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
        </Link>
      </section>

      {mounted && unsettled.length > 0 ? (
        <section className="mt-10" aria-labelledby="unsettled-heading">
          <div className="flex items-center gap-2 text-warn"><Clock3 size={18} aria-hidden="true" /><h2 id="unsettled-heading" className="font-mono text-xs font-semibold uppercase tracking-[0.18em]">Continue a local draft</h2></div>
          <div className="mt-4 space-y-3">
            {unsettled.map((tab) => (
              <Link key={tab.id} href="/app/tab" className="touch-target flex flex-col gap-3 rounded-2xl border border-warn/25 bg-surface-1 px-4 py-4 transition-colors hover:border-warn/50 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium text-txt">{tab.merchant}</p>
                  <p className="mt-1 truncate text-sm text-muted">{tab.people.join(" · ")}</p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="font-mono text-sm tabular-nums text-txt">{formatFiatMinor(tab.totalMinor, tab.currency)}</span>
                  <span className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wide ${VERDICT_TONE[tab.verdict]}`}>{verdictLabel(tab.verdict)}</span>
                  <ArrowRight size={17} className="text-warn" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="recent-heading">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-faint">Device history</p>
            <h2 id="recent-heading" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-txt">Recent tabs</h2>
          </div>
          <p className="text-sm text-muted">Stored only in this browser; no cloud account is implied.</p>
        </div>

        {mounted && history.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-quiet-soft bg-surface-1">
            {history.slice(0, 8).map((tab) => (
              <div key={`${tab.id}-${tab.at}`} className="flex flex-col gap-3 border-b border-quiet-soft px-4 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-txt">{tab.merchant}</p>
                  <p className="mt-1 truncate text-sm text-muted">{new Date(tab.at).toLocaleString()} · {tab.people.join(" · ")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm tabular-nums text-txt">{formatFiatMinor(tab.totalMinor, tab.currency)}</span>
                  <span className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wide ${VERDICT_TONE[tab.verdict]}`}>{verdictLabel(tab.verdict)}</span>
                  {tab.txLink ? (
                    <a href={tab.txLink} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-info hover:bg-info/10 hover:text-txt">
                      transaction <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="surface-shadow mt-5 rounded-2xl border border-dashed border-quiet bg-surface-1/70 px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-muted"><ReceiptText size={22} aria-hidden="true" /></span>
            <p className="mt-5 font-medium text-txt">No local tabs yet</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">Start with a receipt. This device keeps a local record; authenticated shared history appears separately above.</p>
            <Link href="/app/tab" className="touch-target mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90">
              Start a testnet tab <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
