"use client";

import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

const TX =
  "0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c";
const TX_SHORT = "0x1130…278c";
const EXEC_ID = "g0w11wukbk1v0psyditx4";
const BASESCAN_TX = `https://sepolia.basescan.org/tx/${TX}`;
const MCP_URL = "https://finaltab.vercel.app/api/mcp";
const PR_URL = "https://github.com/KeeperHub/cli/pull/95";
const REPO_URL = "https://github.com/vaibhav4046/finaltab";

const PIPELINE = [
  {
    n: "01",
    name: "Scan",
    detail:
      "Photograph the receipt. Vision extracts merchant, items, tax, service — then a deterministic arithmetic check re-adds every line before anything is accepted.",
  },
  {
    n: "02",
    name: "Confirm",
    detail:
      "Humans confirm the extraction. AI proposes; it never silently decides. Unconfirmed items never reach the ledger.",
  },
  {
    n: "03",
    name: "Split",
    detail:
      "Say it in plain language — \"Vee had the daal, split service fairly.\" The model parses intent; the deterministic engine does every penny of math.",
  },
  {
    n: "04",
    name: "Net",
    detail:
      "The debt graph collapses. Six IOUs become two transfers. Provably conservation-safe netting — every debtor pays exactly their share.",
  },
  {
    n: "05",
    name: "Freeze",
    detail:
      "The ledger canonicalizes to JSON and hashes with keccak256. That hash seeds every transfer nonce — sign one ledger, and only that ledger can settle.",
  },
  {
    n: "06",
    name: "Sign",
    detail:
      "Each debtor signs an EIP-3009 transferWithAuthorization. Time-boxed, nonce-bound, no allowances, no custody.",
  },
  {
    n: "07",
    name: "Settle",
    detail:
      "KeeperHub simulates first — a failing settlement is blocked before broadcast. Then it executes the USDC batch on Base Sepolia and returns a verifiable receipt.",
  },
];

const RECEIPT_ITEMS = [
  { name: "Daal Makhani", price: "9.50" },
  { name: "Garlic Naan ×2", price: "7.00" },
  { name: "Chicken Ruby", price: "14.00" },
  { name: "Saag Paneer", price: "8.75" },
  { name: "Basmati Rice", price: "4.20" },
];

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8h10m0 0L9 4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8.5l3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-quiet/60 bg-canvas/85 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-signal text-ink">
            <CheckIcon />
          </span>
          <span className="text-sm font-semibold tracking-wide">FINALTab</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm text-muted md:flex">
          <a href="#product" className="transition-colors hover:text-txt">
            Product
          </a>
          <a href="#proof" className="transition-colors hover:text-txt">
            Proof
          </a>
          <Link href="/developers" className="transition-colors hover:text-txt">
            Developers
          </Link>
          <Link href="/open-source" className="transition-colors hover:text-txt">
            Open source
          </Link>
        </div>
        <Link
          href="/app"
          className="rounded-lg bg-signal px-3.5 py-1.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          Open FINALTab
        </Link>
      </nav>
    </header>
  );
}

function TiltReceipt() {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [8, -8]), {
    stiffness: 150,
    damping: 20,
  });
  const ry = useSpring(useTransform(mx, [0, 1], [-10, 10]), {
    stiffness: 150,
    damping: 20,
  });

  return (
    <motion.div
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width);
        my.set((e.clientY - r.top) / r.height);
      }}
      onMouseLeave={() => {
        mx.set(0.5);
        my.set(0.5);
      }}
      className="relative mx-auto w-full max-w-xs select-none"
    >
      <div className="receipt-paper relative px-6 pb-8 pt-6 font-mono text-[13px] text-ink">
        <p className="text-center text-sm font-bold tracking-[0.2em]">
          RUBY TANDOOR
        </p>
        <p className="mt-0.5 text-center text-[11px] text-ink-soft">
          Table 12 · Party of 4
        </p>
        <div className="my-3 border-t border-dashed border-ink-soft/40" />
        {RECEIPT_ITEMS.map((item) => (
          <div key={item.name} className="flex items-baseline gap-2 py-0.5">
            <span>{item.name}</span>
            <span className="leader flex-1" />
            <span>{item.price}</span>
          </div>
        ))}
        <div className="my-3 border-t border-dashed border-ink-soft/40" />
        <div className="flex justify-between py-0.5 text-ink-soft">
          <span>Subtotal</span>
          <span>43.45</span>
        </div>
        <div className="flex justify-between py-0.5 text-ink-soft">
          <span>Service 12.5%</span>
          <span>5.43</span>
        </div>
        <div className="mt-1 flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>£48.88</span>
        </div>
        <div className="mt-4 flex items-center justify-center gap-1.5 rounded bg-ink/5 py-1.5 text-[11px] font-semibold text-ink">
          <CheckIcon />
          arithmetic verified · 0 issues
        </div>
        <div className="receipt-tear absolute -bottom-[10px] left-0 right-0" />
      </div>
    </motion.div>
  );
}

function CollapseViz() {
  return (
    <div className="mx-auto mt-14 flex max-w-lg flex-wrap items-center justify-center gap-3 text-xs sm:gap-4">
      <div className="rounded-xl border border-quiet bg-surface-1 px-4 py-3">
        <p className="font-mono text-[11px] text-faint">before netting</p>
        <p className="mt-1 text-lg font-semibold text-muted">6 IOUs</p>
      </div>
      <div className="text-signal">
        <ArrowIcon />
      </div>
      <div className="rounded-xl border border-signal/30 bg-surface-1 px-4 py-3">
        <p className="font-mono text-[11px] text-faint">after netting</p>
        <p className="mt-1 text-lg font-semibold text-signal">2 transfers</p>
      </div>
      <div className="text-signal">
        <ArrowIcon />
      </div>
      <div className="rounded-xl border border-quiet bg-surface-1 px-4 py-3">
        <p className="font-mono text-[11px] text-faint">after execution</p>
        <p className="mt-1 text-lg font-semibold text-txt">0 owed</p>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="atmosphere relative overflow-hidden pb-20 pt-32 sm:pt-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="font-mono text-xs tracking-[0.3em] text-signal">
              SETTLEMENT OS
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              The bill isn&apos;t settled until the money moves.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              FINALTab turns shared receipts into one agreed, verified
              settlement — from photo to zero IOUs. Most expense apps tell you
              who owes whom. FINALTab actually closes the tab.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/app"
                className="rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                Open FINALTab
              </Link>
              <a
                href="#proof"
                className="rounded-lg border border-quiet px-5 py-2.5 text-sm font-medium text-txt transition-colors hover:border-signal/50 hover:text-signal"
              >
                See the proof
              </a>
            </div>
            <a
              href={BASESCAN_TX}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-quiet bg-surface-1 px-3.5 py-1.5 font-mono text-xs text-muted transition-colors hover:border-signal/40 hover:text-txt"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-signal" />
              KeeperHub executed · Base Sepolia · Verified receipt {TX_SHORT}
            </a>
          </div>
          <TiltReceipt />
        </div>
        <CollapseViz />
      </div>
    </section>
  );
}

function SectionHead({
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-xs tracking-[0.25em] text-signal">
        {kicker}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {sub ? <p className="mt-3 text-muted">{sub}</p> : null}
    </div>
  );
}

function ProblemSection() {
  const gaps = [
    {
      title: "Apps track. People still chase.",
      body: "Splitting tools produce a list of who owes whom, then stop. The awkward part — actually moving the money — stays manual.",
    },
    {
      title: "Group debts rot.",
      body: "Every unsettled IOU is a small open loop. They accumulate across dinners, trips, and flats until someone gives up on collecting.",
    },
    {
      title: "\"Paid you back\" isn't proof.",
      body: "A message saying it's settled is not a settlement. There's no shared, verifiable record everyone can point at.",
    },
  ];
  return (
    <section id="product" className="border-t border-quiet/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          kicker="THE GAP"
          title="Splitting is a solved problem. Settling isn't."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {gaps.map((g) => (
            <div
              key={g.title}
              className="rounded-xl border border-quiet bg-surface-1 p-6"
            >
              <h3 className="font-semibold">{g.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {g.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PipelineSection() {
  return (
    <section className="border-t border-quiet/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          kicker="HOW IT WORKS"
          title="Photo in. Verified onchain settlement out."
          sub="Seven stages. The AI layer proposes, the deterministic engine decides, and nothing moves money without explicit signatures."
        />
        <ol className="mt-10">
          {PIPELINE.map((stage, i) => (
            <li
              key={stage.n}
              className="group relative grid gap-2 border-l border-quiet py-5 pl-8 sm:grid-cols-[110px_1fr] sm:gap-6"
            >
              <span
                className={`absolute -left-[5px] top-7 h-2.5 w-2.5 rounded-full ${
                  i === PIPELINE.length - 1 ? "bg-signal" : "bg-quiet"
                } transition-colors group-hover:bg-signal`}
              />
              <span className="font-mono text-sm text-faint">
                {stage.n} · {stage.name}
              </span>
              <p className="text-sm leading-relaxed text-muted">
                {stage.detail}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function RoomSection() {
  const features = [
    {
      title: "Natural-language splitting",
      body: "\"Ravi had everything else, split service fairly\" becomes editable rule chips. If the model's proposal doesn't reconcile to the receipt total, the engine rejects it — all of it.",
    },
    {
      title: "Reconciliation, always visible",
      body: "Every share table carries a Σ = receipt total badge. The room never shows an allocation that doesn't add up to the penny.",
    },
    {
      title: "Debt-graph collapse",
      body: "Watch raw IOUs net down to the minimum transfer set. Real numbers from your real receipt — the animation is the math, not a decoration.",
    },
    {
      title: "Freeze before signature",
      body: "The ledger canonicalizes and hashes before anyone signs. Change a single penny afterwards and every signature is void by construction.",
    },
  ];
  return (
    <section className="border-t border-quiet/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          kicker="THE SETTLEMENT ROOM"
          title="One room. One agreed ledger. Zero ambiguity."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-quiet bg-surface-1 p-6 transition-colors hover:border-signal/30"
            >
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {f.body}
              </p>
            </div>
          ))}
        </div>
        <Link
          href="/app"
          className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-signal transition-colors hover:text-txt"
        >
          Enter the settlement room <ArrowIcon />
        </Link>
      </div>
    </section>
  );
}

function ProofSection() {
  const rows = [
    ["Execution ID", EXEC_ID],
    ["Transaction", TX_SHORT],
    ["Chain", "Base Sepolia · 84532"],
    ["Block", "45,243,955"],
    ["Gas used", "80,521"],
    ["Receipt status", "success · verified"],
  ];
  return (
    <section id="proof" className="border-t border-quiet/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHead
              kicker="LANDED PROOF"
              title="This isn't a mock. KeeperHub already executed for FINALTab."
              sub="A real USDC transferWithAuthorization batch, executed through KeeperHub on Base Sepolia, verified against the chain receipt. Fail-closed: FINALTab reports success only after independent receipt verification."
            />
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={BASESCAN_TX}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-quiet px-4 py-2 text-sm text-txt transition-colors hover:border-signal/50 hover:text-signal"
              >
                View on BaseScan
              </a>
              <Link
                href="/app/proof"
                className="rounded-lg border border-quiet px-4 py-2 text-sm text-txt transition-colors hover:border-signal/50 hover:text-signal"
              >
                Open the Settlement Capsule
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-signal/25 bg-surface-1 p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-signal text-ink">
                <CheckIcon />
              </span>
              <p className="text-sm font-semibold tracking-wide">
                VERIFIED SETTLEMENT
              </p>
            </div>
            <dl className="mt-5 space-y-2.5 font-mono text-xs">
              {rows.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-4 border-b border-quiet/50 pb-2.5"
                >
                  <dt className="text-faint">{k}</dt>
                  <dd className="break-all text-right text-txt">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReliabilitySection() {
  const scenarios = [
    "Expired authorization window",
    "Ledger altered after freeze",
    "Split that doesn't reconcile",
    "Missing participant signature",
    "Wrong chain",
    "Duplicate settlement replay",
  ];
  return (
    <section className="border-t border-quiet/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          kicker="RELIABILITY LAB"
          title="We break it in front of you."
          sub="Inject a real failure, watch the real check block it before broadcast, repair it, and pass. No manufactured responses — every scenario exercises the actual engine code."
        />
        <div className="mt-8 flex flex-wrap gap-2.5">
          {scenarios.map((s) => (
            <span
              key={s}
              className="rounded-full border border-danger/30 bg-danger/5 px-3.5 py-1.5 text-xs text-danger"
            >
              {s}
            </span>
          ))}
        </div>
        <Link
          href="/lab"
          className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-signal transition-colors hover:text-txt"
        >
          Open the Reliability Lab <ArrowIcon />
        </Link>
      </div>
    </section>
  );
}

function DevelopersSection() {
  return (
    <section className="border-t border-quiet/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          kicker="DEVELOPERS"
          title="A settlement engine, not just an app."
          sub="Deterministic TypeScript packages for money, splitting, netting, ledger hashing, and EIP-3009 — plus a live MCP endpoint and a receipt-verifying KeeperHub client."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-quiet bg-surface-1 p-5 font-mono text-xs leading-relaxed">
            <p className="text-faint"># verify a KeeperHub execution receipt</p>
            <p className="mt-1 text-txt">
              $ kh-proof verify --execution-id {EXEC_ID}
            </p>
            <p className="mt-2 text-signal">✓ receipt fetched from chain</p>
            <p className="text-signal">✓ status success · block 45243955</p>
            <p className="text-signal">✓ verified: true</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-quiet bg-surface-1 p-5 font-mono text-xs leading-relaxed">
            <p className="text-faint"># live MCP endpoint — Streamable HTTP</p>
            <p className="mt-1 break-all text-info">{MCP_URL}</p>
            <p className="mt-2 text-muted">
              tools: split_equal · split_weighted · net_debts ·
              settlement_status
            </p>
          </div>
        </div>
        <Link
          href="/developers"
          className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-signal transition-colors hover:text-txt"
        >
          Developer docs <ArrowIcon />
        </Link>
      </div>
    </section>
  );
}

function OpenSourceSection() {
  const stats: Array<[string, string]> = [
    ["109", "passing tests across 5 packages"],
    ["7", "deterministic engine modules"],
    ["0", "places a model controls final math"],
  ];
  return (
    <section className="border-t border-quiet/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          kicker="OPEN SOURCE"
          title="Built in the open. Contributing upstream."
          sub="The whole monorepo is public — engine, vision, KeeperHub client, contracts, and this app. We also contributed onboarding improvements to the KeeperHub CLI itself: PR #95, open and under review."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {stats.map(([n, label]) => (
            <div
              key={label}
              className="rounded-xl border border-quiet bg-surface-1 p-6"
            >
              <p className="font-mono text-3xl font-semibold text-signal">
                {n}
              </p>
              <p className="mt-1 text-sm text-muted">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-quiet px-4 py-2 text-sm text-txt transition-colors hover:border-signal/50 hover:text-signal"
          >
            github.com/vaibhav4046/finaltab
          </a>
          <a
            href={PR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-quiet px-4 py-2 text-sm text-txt transition-colors hover:border-signal/50 hover:text-signal"
          >
            KeeperHub CLI PR #95 (open)
          </a>
        </div>
      </div>
    </section>
  );
}

function AgentSection() {
  return (
    <section className="border-t border-quiet/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          kicker="AGENT-NATIVE"
          title="Your agent can settle the tab too."
          sub="FINALTab ships a live MCP server. Connect Claude or any MCP client and split, net, and check settlement status conversationally — money-moving operations always require explicit human consent."
        />
        <div className="mt-8 max-w-xl overflow-x-auto rounded-xl border border-quiet bg-surface-1 p-5 font-mono text-xs leading-relaxed">
          <p className="text-faint">{"// claude_desktop_config.json"}</p>
          <pre className="mt-1 whitespace-pre text-txt">{`{
  "mcpServers": {
    "finaltab": { "url": "${MCP_URL}" }
  }
}`}</pre>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-quiet/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 text-sm text-faint sm:flex-row sm:items-center sm:px-6">
        <p>
          FINALTab — built for the KeeperHub “Agents Onchain” hackathon.
          Testnet software; not financial advice.
        </p>
        <div className="flex gap-5">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-txt"
          >
            GitHub
          </a>
          <a
            href={BASESCAN_TX}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-txt"
          >
            BaseScan
          </a>
          <Link href="/lab" className="transition-colors hover:text-txt">
            Reliability Lab
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <Hero />
        <ProblemSection />
        <PipelineSection />
        <RoomSection />
        <ProofSection />
        <ReliabilitySection />
        <DevelopersSection />
        <OpenSourceSection />
        <AgentSection />
      </main>
      <Footer />
    </div>
  );
}
