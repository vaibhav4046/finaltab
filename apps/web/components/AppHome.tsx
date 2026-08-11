import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CircleCheck,
  FileCheck2,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Signature,
  Users,
  type LucideIcon,
} from "lucide-react";
import { CloudTabsPanel } from "./CloudTabsPanel";

const PRODUCT_ROUTE: Array<{
  title: string;
  status: string;
  copy: string;
  icon: LucideIcon;
  tone: string;
}> = [
  { title: "Scan", status: "Available", copy: "Extract bounded receipt lines", icon: ScanLine, tone: "text-signal" },
  { title: "Confirm", status: "Human review", copy: "Correct every item and total", icon: CircleCheck, tone: "text-info" },
  { title: "Invite", status: "Account gated", copy: "Expiring, single-use cloud links", icon: Users, tone: "text-info" },
  { title: "Sign", status: "Wallet required", copy: "Each exact debtor approves", icon: Signature, tone: "text-warn" },
  { title: "Settle", status: "Base Sepolia", copy: "KeeperHub V2 then independent proof", icon: ShieldCheck, tone: "text-verified" },
];

export function AppHome() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <section className="surface-shadow relative overflow-hidden rounded-3xl border border-quiet-soft bg-surface-1 p-6 sm:p-8 lg:p-10" aria-labelledby="workspace-title">
        <div className="ledger-grid absolute inset-0" aria-hidden="true" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-signal">Settlement OS</p>
            <h1 id="workspace-title" className="display-type mt-4 max-w-3xl text-4xl leading-[1.02] text-txt sm:text-5xl">
              From receipt to consent to verifiable proof.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Signed-in groups share durable tabs, reconcile every cent, run bounded agent reviews, and execute only after each exact debtor wallet approves the frozen V2 plan.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/app/tab" className="touch-target inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-ink transition-[transform,background-color] duration-200 hover:bg-signal-dim active:scale-[0.98]">
                Create a durable settlement <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/app/agents" className="touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-quiet bg-surface-2 px-5 text-sm font-semibold text-txt transition-colors hover:border-info/50 hover:text-info">
                Open agents and memory <Bot size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="grid min-w-[230px] grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-info/25 bg-info/5 p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-faint">Execution</p>
              <p className="mt-2 text-lg font-semibold text-info">KeeperHub V2</p>
              <p className="mt-1 text-sm text-muted">simulate before submit</p>
            </div>
            <div className="rounded-2xl border border-verified/25 bg-verified/5 p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-faint">Proof</p>
              <p className="mt-2 text-lg font-semibold text-verified">Independent RPC</p>
              <p className="mt-1 text-sm text-muted">exact plan binding</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="route-heading">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-info">Product route</p>
            <h2 id="route-heading" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-txt">One explicit state transition at a time</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted">No stored signer keys and no invented completion state. Missing configuration or evidence blocks the flow visibly.</p>
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
          <p className="mt-2 text-sm leading-6 text-muted">Confirmed extraction, cent-perfect allocation, external-wallet approvals, KeeperHub execution.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-signal">Open room <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
        </Link>
        <Link href="/app/agents" className="group touch-target surface-shadow rounded-2xl border border-quiet-soft bg-surface-1 p-5 transition-colors hover:border-info/50">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-info/10 text-info"><Bot size={22} aria-hidden="true" /></span>
          <h2 className="mt-6 text-lg font-semibold text-txt">Agents and memory</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Inspect durable extraction, arithmetic, consent-risk, and proof stages with bounded, deletable memory.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-info">Review evidence <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
        </Link>
        <Link href="/app/proof" className="group touch-target surface-shadow rounded-2xl border border-quiet-soft bg-surface-1 p-5 transition-colors hover:border-verified/50">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-verified/10 text-verified"><FileCheck2 size={22} aria-hidden="true" /></span>
          <h2 className="mt-6 text-lg font-semibold text-txt">Proofs</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Verify a real execution ID against KeeperHub and Base Sepolia without trusting a screenshot.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-verified">Inspect proof <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
        </Link>
      </section>
    </div>
  );
}
