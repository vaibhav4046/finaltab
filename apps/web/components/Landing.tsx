"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CircleCheck,
  Code2,
  ExternalLink,
  FileCheck2,
  GitFork,
  KeyRound,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Signature,
  Sparkles,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

const TX = "0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f";
const TX_SHORT = "0x904e…e8f";
const EXECUTION_ID = "xasakw5nfxkh2s0fh4stn";
const BASESCAN_TX = `https://sepolia.basescan.org/tx/${TX}`;
const SETTLEMENT_TX = "0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789";
const SETTLEMENT_TX_SHORT = "0x7a6f…a789";
const SETTLEMENT_EXECUTION_ID = "3hmlqi36zweiwg6fc5o2u";
const BASESCAN_SETTLEMENT_TX = `https://sepolia.basescan.org/tx/${SETTLEMENT_TX}`;
const SETTLEMENT_ID_SHORT = "0x8b67…b9db";
const LEDGER_HASH_SHORT = "0x1581…b91e";
const CONTRACT = "0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB";
const BASESCAN_CONTRACT = `https://sepolia.basescan.org/address/${CONTRACT}`;
const MCP_URL = "https://finaltab.vercel.app/api/mcp";
const REPO_URL = "https://github.com/vaibhav4046/finaltab";

const HACKATHON_CATEGORIES = [
  "Blockchain",
  "Web3",
  "DeFi",
  "AI Agents",
  "Onchain",
  "MCP",
  "Autonomous Agents",
  "Infrastructure",
] as const;

const CATEGORY_EVIDENCE = [
  {
    marker: "01 / Rail",
    title: "V2 testnet settlement rail",
    copy: "KeeperHub deployed the exact-source-matched V2 contract, then a separate one-atomic-unit run proved its dual-signature USDC rail with exact event and balance checks.",
  },
  {
    marker: "02 / Agent surface",
    title: "Nine authenticated production MCP tools",
    copy: "The authenticated production manifest covers allocation, netting, freezing, simulation, approval, submission, and exact settlement verification.",
  },
  {
    marker: "03 / Autonomy boundary",
    title: "Agents orchestrate. People authorize value.",
    copy: "Every debtor supplies external-wallet signatures, and broadcast also requires a short-lived approval signed by a permitted human wallet.",
  },
  {
    marker: "04 / Integration",
    title: "Built to plug into KeeperHub",
    copy: "OpenAPI, discovery metadata, workflow templates, MCP, and independent receipt proof make the rail reusable from other agent systems.",
  },
] as const;

type JourneyStep = {
  number: string;
  title: string;
  status: string;
  copy: string;
  icon: LucideIcon;
  tone: string;
};

const JOURNEY: JourneyStep[] = [
  {
    number: "01",
    title: "Scan",
    status: "Live",
    copy: "Choose a receipt photo. Groq vision returns structured line items and the engine re-adds the arithmetic.",
    icon: ScanLine,
    tone: "border-signal/35 bg-signal/10 text-signal",
  },
  {
    number: "02",
    title: "Confirm",
    status: "Human review",
    copy: "Inspect every extracted line and the receipt total before allocating. Replace the photo when the result is wrong.",
    icon: CircleCheck,
    tone: "border-info/35 bg-info/10 text-info",
  },
  {
    number: "03",
    title: "Invite",
    status: "Backend provisioned",
    copy: "The London Supabase schema is provisioned with RLS and indexed relations. Cross-device behavior stays unclaimed until the final release passes its live browser probe.",
    icon: Users,
    tone: "border-quiet bg-surface-2 text-muted",
  },
  {
    number: "04",
    title: "Sign",
    status: "Debtor wallets",
    copy: "Each debtor signs a USDC authorization and a V2 full-plan consent in their own wallet. The plan accepts only signer-provided wallet artifacts.",
    icon: Signature,
    tone: "border-warn/35 bg-warn/10 text-warn",
  },
  {
    number: "05",
    title: "Settle",
    status: "Rail + value proof live",
    copy: "KeeperHub simulated and executed one exact atomic V2 transfer; independent receipt, event, and balance checks verified the Base Sepolia result.",
    icon: ShieldCheck,
    tone: "border-verified/35 bg-verified/10 text-verified",
  },
];

const RECEIPT_ITEMS = [
  ["Charred aubergine", "14.40"],
  ["Saffron rice", "8.00"],
  ["Chilli paneer", "17.60"],
  ["House sodas ×3", "12.00"],
];

type LedgerStage = "receipt" | "raw" | "netted" | "proof";

const LEDGER_STAGES: Array<{
  id: LedgerStage;
  number: string;
  label: string;
  short: string;
  icon: LucideIcon;
}> = [
  { id: "receipt", number: "01", label: "Confirm the receipt", short: "$68.40 reconciled", icon: ReceiptText },
  { id: "raw", number: "02", label: "Inspect raw debts", short: "3 obligations", icon: GitFork },
  { id: "netted", number: "03", label: "Net the graph", short: "2 transfers", icon: WalletCards },
  { id: "proof", number: "04", label: "Match exact proof", short: "Fail closed", icon: ShieldCheck },
];

function PublicNav() {
  return (
    <header className="marketing-nav pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <nav
        className="pointer-events-auto mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 rounded-2xl border border-quiet-soft bg-canvas/88 px-4 shadow-[0_16px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:px-5"
        aria-label="Primary navigation"
      >
        <Link href="/" className="touch-target flex items-center gap-3 rounded-lg" aria-label="FINALTab home">
          <span className="text-[17px] font-semibold tracking-[-0.035em] text-txt">
            FINAL<span className="text-signal">Tab</span>
          </span>
          <span className="hidden items-center gap-1.5 border-l border-quiet-soft pl-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint sm:inline-flex">
            <span className="proof-beacon" aria-hidden="true"><span /><span /></span>
            testnet live
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <a href="#journey" className="touch-target inline-flex items-center rounded-lg px-3 text-sm text-muted transition-colors hover:bg-surface-1 hover:text-txt">
            How it works
          </a>
          <a href="#proof" className="touch-target inline-flex items-center rounded-lg px-3 text-sm text-muted transition-colors hover:bg-surface-1 hover:text-txt">
            Live proof
          </a>
          <Link href="/developers" className="touch-target inline-flex items-center rounded-lg px-3 text-sm text-muted transition-colors hover:bg-surface-1 hover:text-txt">
            Developers
          </Link>
          <Link href="/open-source" className="touch-target inline-flex items-center rounded-lg px-3 text-sm text-muted transition-colors hover:bg-surface-1 hover:text-txt">
            Open source
          </Link>
        </div>

        <Link
          href="/app"
          className="touch-target inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-4 text-sm font-semibold text-ink transition-[transform,background-color] duration-200 hover:bg-signal-dim active:scale-[0.98]"
        >
          <span className="hidden sm:inline">Open settlement workspace</span>
          <span className="sm:hidden">Open workspace</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}

function ReceiptPreview() {
  return (
    <div className="scan-window receipt-paper mx-auto w-full max-w-[340px] px-6 pb-8 pt-7 text-ink">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">Table 14</p>
          <p className="mt-1 text-lg font-bold tracking-[-0.02em]">NIGHT MARKET</p>
        </div>
        <span className="rounded-full border border-ink/15 bg-ink/5 px-2.5 py-1 font-mono text-xs font-semibold">
          USD
        </span>
      </div>
      <div className="my-4 border-t border-dashed border-ink-soft/35" />
      <div className="space-y-2 font-mono text-xs">
        {RECEIPT_ITEMS.map(([name, price]) => (
          <div key={name} className="flex items-baseline gap-2">
            <span>{name}</span>
            <span className="leader min-w-3 flex-1" aria-hidden="true" />
            <span className="tabular-nums">{price}</span>
          </div>
        ))}
      </div>
      <div className="my-4 border-t border-dashed border-ink-soft/35" />
      <div className="space-y-1.5 font-mono text-xs text-ink-soft">
        <div className="flex justify-between"><span>Subtotal</span><span>52.00</span></div>
        <div className="flex justify-between"><span>Service</span><span>6.50</span></div>
        <div className="flex justify-between"><span>Tax</span><span>9.90</span></div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-ink/20 pt-3 font-mono text-sm font-bold">
        <span>Total</span><span>$68.40</span>
      </div>
      <div className="mt-5 flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink/5 px-3 font-mono text-xs font-semibold">
        <Check size={15} aria-hidden="true" /> arithmetic reconciled
      </div>
      <div className="receipt-tear absolute inset-x-0 -bottom-[10px]" />
    </div>
  );
}

function AmountTag({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-48" y="-17" width="96" height="34" rx="9" fill="#0a0d0b" stroke="#344238" />
      <text
        x="0"
        y="1"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="#f4f8f1"
        fontFamily="ui-monospace, monospace"
        fontSize="19"
        fontWeight="650"
      >
        {children}
      </text>
    </g>
  );
}

function LedgerNode({ x, y, name, detail, payer = false }: { x: number; y: number; name: string; detail: string; payer?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width="132"
        height="72"
        rx="15"
        fill={payer ? "#11180b" : "#101511"}
        stroke={payer ? "#c8ff3d" : "#344238"}
        strokeWidth="2"
      />
      <circle cx="24" cy="25" r="9" fill={payer ? "#c8ff3d" : "#45afff"} />
      <text x="43" y="31" fill="#f4f8f1" fontFamily="ui-sans-serif, system-ui" fontSize="20" fontWeight="650">{name}</text>
      <text x="17" y="56" fill="#b7c0b8" fontFamily="ui-monospace, monospace" fontSize="14">{detail}</text>
    </g>
  );
}

function DebtGraph({ stage, reduceMotion }: { stage: "raw" | "netted"; reduceMotion: boolean | null }) {
  const raw = stage === "raw";
  const routeInitial = reduceMotion ? false : { opacity: 0 };

  return (
    <motion.svg
      key={stage}
      viewBox="0 0 600 340"
      className="h-auto w-full"
      role="img"
      aria-label={raw
        ? "Raw debt graph. Guest 01 owes the payer 18 dollars 40 cents and Guest 02 5 dollars 70 cents. Guest 02 owes the payer 17 dollars 10 cents."
        : "Netted transfer graph. Guest 01 owes the payer 24 dollars 10 cents and Guest 02 owes the payer 11 dollars 40 cents."}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <defs>
        <marker id="ledger-arrow-signal" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
          <path d="M0 0 10 5 0 10Z" fill="#c8ff3d" />
        </marker>
        <marker id="ledger-arrow-info" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
          <path d="M0 0 10 5 0 10Z" fill="#45afff" />
        </marker>
      </defs>

      <path d="M0 122H600M0 298H600" stroke="#182018" strokeWidth="1" strokeDasharray="4 8" />
      <text x="16" y="112" fill="#7e8b82" fontFamily="ui-monospace, monospace" fontSize="13" letterSpacing="2">PAID</text>
      <text x="16" y="324" fill="#7e8b82" fontFamily="ui-monospace, monospace" fontSize="13" letterSpacing="2">OWES</text>

      <motion.path
        d={raw ? "M184 251 C213 177 257 127 293 102" : "M184 251 C215 171 257 122 293 102"}
        fill="none"
        stroke={raw ? "#45afff" : "#c8ff3d"}
        strokeWidth={raw ? 3 : 4.5}
        strokeLinecap="round"
        markerEnd={raw ? "url(#ledger-arrow-info)" : "url(#ledger-arrow-signal)"}
        vectorEffect="non-scaling-stroke"
        initial={routeInitial}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        d={raw ? "M468 251 C439 177 395 127 359 102" : "M468 251 C437 171 395 122 359 102"}
        fill="none"
        stroke={raw ? "#45afff" : "#c8ff3d"}
        strokeWidth={raw ? 3 : 4.5}
        strokeLinecap="round"
        markerEnd={raw ? "url(#ledger-arrow-info)" : "url(#ledger-arrow-signal)"}
        vectorEffect="non-scaling-stroke"
        initial={routeInitial}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: reduceMotion ? 0 : 0.04, ease: [0.22, 1, 0.36, 1] }}
      />
      {raw ? (
        <motion.path
          d="M199 293 C278 328 375 328 454 293"
          fill="none"
          stroke="#45afff"
          strokeWidth="3"
          strokeLinecap="round"
          markerEnd="url(#ledger-arrow-info)"
          vectorEffect="non-scaling-stroke"
          initial={routeInitial}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: reduceMotion ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : null}

      <AmountTag x={raw ? 222 : 225} y={169}>{`$${raw ? "18.40" : "24.10"}`}</AmountTag>
      <AmountTag x={raw ? 430 : 425} y={169}>{`$${raw ? "17.10" : "11.40"}`}</AmountTag>
      {raw ? <AmountTag x={326} y={314}>$5.70</AmountTag> : null}

      <LedgerNode x={260} y={30} name="Payer" detail="paid $68.40" payer />
      <LedgerNode x={65} y={244} name="Guest 01" detail={raw ? "raw debtor" : "owes $24.10"} />
      <LedgerNode x={455} y={244} name="Guest 02" detail={raw ? "raw debtor" : "owes $11.40"} />
    </motion.svg>
  );
}

function ReceiptMathVisual({ reduceMotion }: { reduceMotion: boolean | null }) {
  const shares = [
    ["Payer", "$32.90", "48.1%"],
    ["Guest 01", "$24.10", "35.2%"],
    ["Guest 02", "$11.40", "16.7%"],
  ];

  return (
    <div className="mx-auto w-full max-w-xl py-3 sm:py-7">
      <div className="flex items-end justify-between gap-5 border-b border-quiet pb-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-faint">Confirmed total</p>
          <p className="display-type mt-1 text-5xl text-txt sm:text-6xl">$68.40</p>
        </div>
        <span className="rounded-full border border-verified/35 bg-verified/10 px-3 py-1.5 font-mono text-xs font-semibold text-verified">SUM EXACT</span>
      </div>
      <div className="mt-7 space-y-5">
        {shares.map(([name, amount, width]) => (
          <div key={name}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-txt">{name}</span>
              <span className="font-mono text-muted">{amount}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full bg-signal"
                style={{ width, transformOrigin: "left" }}
                initial={reduceMotion ? false : { scaleX: 0, opacity: 0.35 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-7 border-l-2 border-signal pl-4 text-sm leading-6 text-muted">
        Line items, service and tax reconcile before these shares can become a ledger.
      </p>
    </div>
  );
}

function ExactProofVisual() {
  return (
    <div className="mx-auto w-full max-w-2xl py-2 sm:py-6">
      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl border border-info/30 bg-info/5 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-info">KeeperHub receipt</p>
          <p className="mt-4 text-sm font-semibold text-txt">Terminal success</p>
          <p className="mt-2 font-mono text-xs leading-6 text-muted">execution id<br />transaction hash<br />block number</p>
        </div>
        <div className="hidden items-center justify-center sm:flex" aria-hidden="true">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-quiet bg-surface-2 font-mono text-faint">+</span>
        </div>
        <div className="rounded-2xl border border-signal/30 bg-signal/5 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-signal">Independent RPC</p>
          <p className="mt-4 text-sm font-semibold text-txt">Exact V2 event</p>
          <p className="mt-2 font-mono text-xs leading-6 text-muted">expected contract<br />settlementId<br />ledgerHash</p>
        </div>
      </div>
      <div className="mt-4 flex min-h-16 items-center gap-3 rounded-2xl border border-verified/35 bg-verified/10 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-verified text-ink"><Check size={18} aria-hidden="true" /></span>
        <div>
          <p className="font-semibold text-txt">Only then: VERIFIED_SETTLED</p>
          <p className="mt-0.5 text-sm leading-6 text-muted">A deployment receipt or an unrelated event cannot satisfy this verdict.</p>
        </div>
      </div>
    </div>
  );
}

const LEDGER_STAGE_COPY: Record<LedgerStage, { eyebrow: string; title: string; copy: string }> = {
  receipt: {
    eyebrow: "Arithmetic gate",
    title: "Confirm what the table actually spent.",
    copy: "The vision model proposes line items. Integer minor-unit math re-adds every charge and refuses a mismatched total.",
  },
  raw: {
    eyebrow: "Uncompressed ledger",
    title: "See every obligation before the shortcut.",
    copy: "The raw graph stays inspectable. Direction means who pays whom; the adjacent table repeats every amount without relying on color or geometry.",
  },
  netted: {
    eyebrow: "Conservation-safe netting",
    title: "Three obligations become two transfers.",
    copy: "The route gets shorter, but every role's net position stays unchanged. Guest 01 pays $24.10; Guest 02 pays $11.40; the payer receives $35.50.",
  },
  proof: {
    eyebrow: "Exact-plan verifier",
    title: "A transaction hash is not the verdict.",
    copy: "FINALTab requires KeeperHub's terminal receipt and independently matches the expected V2 contract, settlement ID and ledger hash onchain.",
  },
};

const LEDGER_STAGE_ROWS: Record<LedgerStage, { title: string; rows: Array<[string, string]>; footer: string }> = {
  receipt: {
    title: "Participant shares",
    rows: [["Payer", "$32.90"], ["Guest 01", "$24.10"], ["Guest 02", "$11.40"]],
    footer: "Shares sum to $68.40",
  },
  raw: {
    title: "Raw obligations",
    rows: [["Guest 01 → Payer", "$18.40"], ["Guest 01 → Guest 02", "$5.70"], ["Guest 02 → Payer", "$17.10"]],
    footer: "3 visible obligations",
  },
  netted: {
    title: "Netted transfers",
    rows: [["Guest 01 → Payer", "$24.10"], ["Guest 02 → Payer", "$11.40"]],
    footer: "2 transfers · $35.50 moved",
  },
  proof: {
    title: "Verifier must match",
    rows: [["KeeperHub status", "terminal success"], ["Event emitter", "expected V2"], ["Settlement ID", "exact"], ["Ledger hash", "exact"]],
    footer: "Fail closed on any mismatch",
  },
};

function LedgerWorkbench() {
  const [stage, setStage] = useState<LedgerStage>("receipt");
  const reduceMotion = useReducedMotion();
  const copy = LEDGER_STAGE_COPY[stage];
  const table = LEDGER_STAGE_ROWS[stage];

  return (
    <div className="surface-shadow mt-12 overflow-hidden rounded-3xl border border-quiet bg-surface-1">
      <div className="border-b border-quiet-soft bg-canvas/45 px-5 py-4 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-faint">Interactive ledger anatomy</p>
          <span className="rounded-full border border-quiet bg-surface-2 px-3 py-1 font-mono text-xs text-muted">Deterministic engine trace · no transaction claim</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <div className="border-b border-quiet-soft p-3 sm:p-5 lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1" role="group" aria-label="Choose a ledger stage">
            {LEDGER_STAGES.map((item) => {
              const Icon = item.icon;
              const active = item.id === stage;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStage(item.id)}
                  className={`touch-target group min-w-0 rounded-xl border px-3 py-3 text-left transition-[background-color,border-color,transform] duration-200 active:scale-[0.99] sm:px-4 ${
                    active ? "border-signal/45 bg-signal/10" : "border-transparent bg-transparent hover:border-quiet hover:bg-surface-2"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${active ? "border-signal/40 bg-signal text-ink" : "border-quiet bg-surface-2 text-muted"}`}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs text-faint">{item.number}</span>
                  </span>
                  <span className="mt-3 block text-sm font-semibold leading-5 text-txt">{item.label}</span>
                  <span className={`mt-1 hidden font-mono text-xs sm:block ${active ? "text-signal" : "text-faint"}`}>{item.short}</span>
                </button>
              );
            })}
          </div>
          <p className="sr-only" aria-live="polite">Showing {LEDGER_STAGES.find((item) => item.id === stage)?.label}</p>
        </div>

        <div className="ledger-register relative min-w-0 border-b border-quiet-soft p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <motion.div
            key={stage}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex min-h-[360px] items-center"
          >
            {stage === "receipt" ? <ReceiptMathVisual reduceMotion={reduceMotion} /> : null}
            {stage === "raw" || stage === "netted" ? <DebtGraph stage={stage} reduceMotion={reduceMotion} /> : null}
            {stage === "proof" ? <ExactProofVisual /> : null}
          </motion.div>
        </div>

        <aside className="flex min-w-0 flex-col p-5 sm:p-7" aria-label={`${table.title} and stage explanation`}>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-signal">{copy.eyebrow}</p>
          <h3 className="display-type mt-3 text-2xl leading-tight text-txt sm:text-3xl">{copy.title}</h3>
          <p className="mt-4 text-sm leading-6 text-muted">{copy.copy}</p>

          <div className="mt-7 border-t border-quiet pt-5">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-faint">{table.title}</p>
            <dl className="mt-3">
              {table.rows.map(([label, value]) => (
                <div key={label} className="flex min-h-11 items-center justify-between gap-3 border-b border-quiet-soft py-2 text-sm">
                  <dt className="min-w-0 text-muted">{label}</dt>
                  <dd className="shrink-0 text-right font-mono text-txt">{value}</dd>
                </div>
              ))}
            </dl>
            <p className={`mt-4 font-mono text-xs font-semibold ${stage === "proof" ? "text-verified" : "text-info"}`}>{table.footer}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function HeroProofRail() {
  const steps = [
    ["Simulated", "KeeperHub preflight passed"],
    ["Deployed", "CreateX · Base Sepolia"],
    ["Re-fetched", "6,367-byte V2 runtime"],
    ["Source matched", "block 45,321,107"],
  ];

  return (
    <div className="surface-shadow h-full rounded-2xl border border-quiet-soft bg-surface-1/92 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-faint">Deployment flight</p>
          <p className="mt-1 font-semibold text-txt">V2 via KeeperHub</p>
        </div>
        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-verified/35 bg-verified/10 px-3 font-mono text-xs font-semibold uppercase tracking-wide text-verified">
          <span className="proof-beacon" aria-hidden="true"><span /><span /></span> verified
        </span>
      </div>
      <ol className="mt-6 space-y-0" aria-label="Verified V2 deployment progress">
        {steps.map(([label, detail], index) => (
          <li key={label} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 ? (
              <span className="proof-transit-line absolute left-[7px] top-4 h-full w-px" aria-hidden="true" />
            ) : null}
            <span className={`relative z-10 mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border bg-surface-1 ${index === steps.length - 1 ? "border-verified" : "border-info"}`} aria-hidden="true">
              <span className={`h-1.5 w-1.5 rounded-full ${index === steps.length - 1 ? "bg-verified" : "bg-info"}`} />
            </span>
            <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-4">
              <span className="text-sm font-medium text-txt">{label}</span>
              <span className="mt-0.5 block break-all font-mono text-xs text-muted sm:mt-0 sm:text-right">{detail}</span>
            </div>
          </li>
        ))}
      </ol>
      <a
        href={BASESCAN_TX}
        target="_blank"
        rel="noopener noreferrer"
        className="touch-target mt-6 inline-flex w-full items-center justify-between rounded-xl border border-quiet bg-surface-2 px-4 font-mono text-xs text-muted transition-colors hover:border-info/50 hover:text-txt"
      >
        <span>tx {TX_SHORT}</span>
        <ExternalLink size={15} aria-hidden="true" />
      </a>
    </div>
  );
}

function CategoryProofDocket() {
  return (
    <section className="border-b border-quiet-soft py-16 sm:py-24" aria-labelledby="category-proof-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="surface-shadow overflow-hidden rounded-3xl border border-quiet bg-surface-1">
          <div className="grid lg:grid-cols-[0.86fr_1.14fr]">
            <div className="border-b border-ink/15 bg-signal p-6 text-ink sm:p-8 lg:border-b-0 lg:border-r">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-ink/65">
                Hackathon category docket
              </p>
              <h2 id="category-proof-title" className="display-type mt-4 text-3xl leading-[1.08] text-ink sm:text-5xl">
                Eight tracks. One auditable path.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-ink/75">
                Each category maps to a shipped surface or an explicitly labelled release gate—not a marketing inference.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2" aria-label="Hackathon categories">
                {HACKATHON_CATEGORIES.map((category) => (
                  <li
                    key={category}
                    className="rounded-md border border-ink/20 bg-ink/10 px-2.5 py-1.5 font-mono text-xs font-semibold text-ink"
                  >
                    {category}
                  </li>
                ))}
              </ul>
            </div>

            <dl className="divide-y divide-quiet-soft">
              {CATEGORY_EVIDENCE.map((item) => (
                <div key={item.marker} className="grid gap-2 px-6 py-5 transition-colors duration-200 hover:bg-surface-2 sm:grid-cols-[10rem_1fr] sm:px-8">
                  <dt className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-faint">{item.marker}</dt>
                  <dd>
                    <p className="text-sm font-semibold text-txt">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{item.copy}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

const EVIDENCE_TICKER = [
  "Groq receipt vision",
  "integer-minor-unit math",
  "dual-wallet consent",
  "KeeperHub execution",
  "exact V2 event match",
  "9 authenticated MCP tools",
  "Base Sepolia",
  "Supabase RLS",
] as const;

function EvidenceMarquee() {
  return (
    <div className="evidence-marquee border-b border-quiet-soft" aria-label="Live product evidence">
      <div className="evidence-marquee-track" aria-hidden="true">
        {[...EVIDENCE_TICKER, ...EVIDENCE_TICKER].map((item, index) => (
          <span key={`${item}-${index}`} className="evidence-marquee-item">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" />
            {item}
          </span>
        ))}
      </div>
      <span className="sr-only">{EVIDENCE_TICKER.join(", ")}</span>
    </div>
  );
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-signal">{eyebrow}</p>
      <h2 className="display-type mt-4 text-3xl leading-[1.08] text-txt sm:text-4xl lg:text-5xl">{title}</h2>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">{copy}</p>
    </div>
  );
}

export default function Landing() {
  const reduceMotion = useReducedMotion();
  const reveal = reduceMotion ? false : { opacity: 0, y: 18 };

  return (
    <div className="marketing-shell min-h-dvh overflow-x-hidden bg-canvas text-txt">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <PublicNav />

      <div id="main-content" tabIndex={-1}>
        <section className="marketing-hero atmosphere relative isolate overflow-hidden border-b border-quiet-soft pb-16 pt-28 sm:pb-24 sm:pt-36">
          <div className="ledger-register ledger-register-hero absolute inset-0 -z-10" aria-hidden="true" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div initial={reveal} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-quiet bg-surface-1/80 px-3.5 font-mono text-xs font-medium text-muted backdrop-blur-sm">
                <Sparkles size={14} className="text-signal" aria-hidden="true" />
                receipt → consent → KeeperHub → exact proof
              </div>
              <h1 className="display-type mt-7 max-w-[1180px] text-[clamp(4rem,10.4vw,9.2rem)] leading-[0.82] text-txt">
                <span className="block">Close the tab.</span>
                <span className="block">Prove the <em className="proof-gradient-text font-normal italic">settlement.</em></span>
              </h1>
              <div className="mt-8 grid gap-8 border-t border-quiet-soft pt-7 lg:grid-cols-[minmax(0,0.78fr)_minmax(420px,1.22fr)] lg:items-end">
                <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl">
                  FINALTab turns a receipt into an exact split, a frozen ledger and a KeeperHub-executed USDC settlement—with an independently matched testnet receipt at the end.
                </p>
                <div>
                  <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                    <Link
                      href="/app/tab"
                      className="touch-target inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-ink transition-[transform,background-color] duration-200 hover:bg-signal-dim active:scale-[0.98]"
                    >
                      Start a testnet settlement <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                    <a
                      href="#proof"
                      className="touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-quiet bg-surface-1/80 px-5 text-sm font-semibold text-txt transition-[transform,border-color,color] duration-200 hover:border-info/60 hover:text-info active:scale-[0.98]"
                    >
                      Inspect the live proof <FileCheck2 size={17} aria-hidden="true" />
                    </a>
                  </div>
                  <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted lg:justify-end" aria-label="Product boundaries">
                    <li className="inline-flex items-center gap-2"><Check size={15} className="text-verified" aria-hidden="true" /> KeeperHub V2 live</li>
                    <li className="inline-flex items-center gap-2"><Check size={15} className="text-verified" aria-hidden="true" /> Cent-perfect math</li>
                    <li className="inline-flex items-center gap-2"><KeyRound size={15} className="text-info" aria-hidden="true" /> Human-authorized value</li>
                  </ul>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, x: 22 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.24, delay: reduceMotion ? 0 : 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="hero-ledger-stage mt-12 grid overflow-hidden rounded-3xl border border-quiet bg-surface-1/88 lg:grid-cols-[0.76fr_1.24fr]"
            >
              <div className="ledger-register relative border-b border-quiet-soft p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <div className="relative mb-6 flex items-center justify-between gap-4">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-faint">01 / Receipt truth</p>
                  <span className="font-mono text-xs text-signal">$68.40 exact</span>
                </div>
                <ReceiptPreview />
              </div>
              <div className="p-4 sm:p-6 lg:p-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-faint">02 / Execution truth</p>
                  <span className="font-mono text-xs text-info">blue = transit</span>
                </div>
                <HeroProofRail />
              </div>
            </motion.div>
          </div>
        </section>

        <EvidenceMarquee />
        <CategoryProofDocket />

        <section id="journey" className="border-b border-quiet-soft bg-surface-1/30 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="The settlement route"
              title="One clear path, with every gap labelled."
              copy="A trustworthy money product should distinguish what works now from what still needs productisation. This is the exact state of the current build."
            />
            <ol className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label="FINALTab product journey">
              {JOURNEY.map((step) => {
                const Icon = step.icon;
                return (
                  <li
                    key={step.title}
                    className="journey-card surface-shadow rounded-2xl border border-quiet-soft bg-surface-1 p-5 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-1 hover:border-signal/35 hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl border border-quiet bg-surface-2 text-txt">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span className="font-mono text-xs text-faint">{step.number}</span>
                    </div>
                    <h3 className="mt-6 text-lg font-semibold text-txt">{step.title}</h3>
                    <span className={`mt-3 inline-flex min-h-7 items-center rounded-full border px-2.5 font-mono text-xs font-medium ${step.tone}`}>
                      {step.status}
                    </span>
                    <p className="mt-4 text-sm leading-6 text-muted">{step.copy}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="border-b border-quiet-soft py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Follow one exact ledger"
              title="Watch a dinner tab become a proof boundary."
              copy="Move through a reconciled receipt, the uncompressed debt graph, conservation-safe netting and the exact event checks required for a settlement verdict."
            />
            <LedgerWorkbench />
          </div>
        </section>

        <section id="proof" className="border-b border-quiet-soft bg-surface-1/25 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Two independent proof boundaries"
              title="Deployment provenance and value movement are separate proofs."
              copy="KeeperHub first deployed the exact-source-matched V2 contract. A different execution then moved exactly one atomic unit of test USDC and passed independent event, balance, settlement-ID, and ledger-hash checks."
            />
            <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-2">
              <article className="surface-shadow overflow-hidden rounded-3xl border border-verified/30 bg-surface-1" aria-labelledby="deployment-proof-title">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-quiet-soft px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-verified/10 text-verified"><ShieldCheck size={20} aria-hidden="true" /></span>
                    <div><p id="deployment-proof-title" className="font-semibold text-txt">V2 contract deployment</p><p className="text-sm text-muted">KeeperHub · Base Sepolia</p></div>
                  </div>
                  <span className="rounded-full border border-verified/30 bg-verified/10 px-3 py-1 font-mono text-xs font-semibold text-verified">SOURCE MATCHED</span>
                </div>
                <dl className="grid sm:grid-cols-2">
                  {[
                    ["Execution", EXECUTION_ID],
                    ["Transaction", TX_SHORT],
                    ["Block", "45,321,107"],
                    ["Runtime", "6,367 bytes"],
                    ["Trigger", "KeeperHub · CreateX"],
                    ["Source", "Sourcify exact match #43497805"],
                  ].map(([term, value]) => (
                    <div key={term} className="border-b border-quiet-soft px-5 py-4 last:border-b-0 sm:border-r sm:px-6 sm:even:border-r-0">
                      <dt className="font-mono text-xs uppercase tracking-wide text-faint">{term}</dt>
                      <dd className="mt-1 break-all text-sm text-txt">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-col gap-3 p-5 sm:flex-row sm:p-6">
                  <a href={BASESCAN_TX} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-verified px-4 text-sm font-semibold text-ink transition-opacity hover:opacity-90">
                    Inspect deployment <ExternalLink size={16} aria-hidden="true" />
                  </a>
                  <a href={BASESCAN_CONTRACT} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-quiet bg-surface-2 px-4 text-sm font-semibold text-txt transition-colors hover:border-info/50 hover:text-info">
                    View contract <ExternalLink size={16} aria-hidden="true" />
                  </a>
                </div>
              </article>

              <article className="surface-shadow overflow-hidden rounded-3xl border border-info/35 bg-surface-1" aria-labelledby="settlement-proof-title">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-quiet-soft px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-info/10 text-info"><FileCheck2 size={20} aria-hidden="true" /></span>
                    <div><p id="settlement-proof-title" className="font-semibold text-txt">One-atomic-unit USDC settlement</p><p className="text-sm text-muted">KeeperHub V2 · separate execution</p></div>
                  </div>
                  <span className="rounded-full border border-info/35 bg-info/10 px-3 py-1 font-mono text-xs font-semibold text-info">VALUE VERIFIED</span>
                </div>
                <dl className="grid sm:grid-cols-2">
                  {[
                    ["Execution", SETTLEMENT_EXECUTION_ID],
                    ["Transaction", SETTLEMENT_TX_SHORT],
                    ["Block", "45,327,128"],
                    ["Amount", "1 atomic USDC"],
                    ["Settlement ID", SETTLEMENT_ID_SHORT],
                    ["Ledger hash", LEDGER_HASH_SHORT],
                  ].map(([term, value]) => (
                    <div key={term} className="border-b border-quiet-soft px-5 py-4 last:border-b-0 sm:border-r sm:px-6 sm:even:border-r-0">
                      <dt className="font-mono text-xs uppercase tracking-wide text-faint">{term}</dt>
                      <dd className="mt-1 break-all text-sm text-txt">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="p-5 sm:p-6">
                  <a href={BASESCAN_SETTLEMENT_TX} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex w-full items-center justify-center gap-2 rounded-xl bg-info px-4 text-sm font-semibold text-ink transition-opacity hover:opacity-90">
                    Inspect value transfer <ExternalLink size={16} aria-hidden="true" />
                  </a>
                  <p className="mt-3 text-center text-xs leading-5 text-muted">Testnet value only. Deployment provenance is not presented as settlement proof.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mcp-cta surface-shadow relative overflow-hidden rounded-3xl border border-signal/25 bg-surface-1 p-6 sm:p-10 lg:p-12">
              <div className="ledger-register absolute inset-0 opacity-60" aria-hidden="true" />
              <div className="relative grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-end">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-info">Agent-native testnet rail</p>
                  <h2 className="display-type mt-4 max-w-3xl text-3xl leading-[1.08] sm:text-5xl">Nine production MCP tools. One explicit money boundary.</h2>
                  <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
                    Allocate and net deterministically, freeze an exact V2 plan, collect signatures from every debtor wallet, simulate through KeeperHub, then require a short-lived human approval artifact before broadcasting.
                  </p>
                  <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                    <Link href="/developers" className="touch-target inline-flex items-center justify-center gap-2 rounded-xl bg-info px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90">
                      MCP developer guide <Code2 size={17} aria-hidden="true" />
                    </Link>
                    <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-quiet bg-surface-2 px-5 text-sm font-semibold text-txt transition-colors hover:border-signal/50 hover:text-signal">
                      Read the source <GitFork size={17} aria-hidden="true" />
                    </a>
                  </div>
                </div>
                <div className="rounded-2xl border border-quiet bg-canvas/90 p-5 font-mono text-xs leading-6 text-muted">
                  <p className="text-faint">Streamable HTTP endpoint</p>
                  <p className="mt-1 break-all text-info">{MCP_URL}</p>
                  <div className="my-4 h-px bg-quiet-soft" />
                  <p><span className="text-signal">compute</span> split_equal · split_weighted · net_debts</p>
                  <p><span className="text-info">compose</span> allocate_receipt · prepare_receipt_settlement</p>
                  <p><span className="text-warn">money</span> simulate · approve · submit</p>
                  <p><span className="text-verified">prove</span> settlement_status</p>
                  <p className="mt-4 text-faint">The public manifest exposes authenticated production tools only.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-quiet-soft py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div><p className="text-lg font-semibold tracking-[-0.035em] text-txt">FINAL<span className="text-signal">Tab</span></p><p className="text-sm text-muted">Testnet software built for the KeeperHub hackathon.</p></div>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Footer navigation">
            <Link href="/developers" className="touch-target inline-flex items-center text-muted hover:text-txt">Developers</Link>
            <Link href="/open-source" className="touch-target inline-flex items-center text-muted hover:text-txt">Open source</Link>
            <Link href="/app/proof" className="touch-target inline-flex items-center text-muted hover:text-txt">Proofs</Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex items-center gap-1.5 text-muted hover:text-txt">GitHub <ExternalLink size={14} aria-hidden="true" /></a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
