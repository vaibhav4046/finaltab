"use client";

import { useState } from "react";

const TX = "0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c";
const EXPLORER = `https://sepolia.basescan.org/tx/${TX}`;

const PROOF = {
  record: "finaltab.flight.v1",
  network: { chain: "Base Sepolia", chainId: 84532 },
  execution: {
    provider: "KeeperHub",
    executionId: "g0w11wukbk1v0psyditx4",
    status: "success",
  },
  transaction: {
    hash: TX,
    blockNumber: 45243955,
    gasUsed: 80521,
    receiptStatus: "success",
  },
  verification: {
    verified: true,
    method: "independent RPC receipt fetch, fail-closed",
    checks: [
      "KeeperHub execution status polled to a terminal state (success)",
      "Transaction hash taken from the KeeperHub execution record",
      "Receipt fetched independently from a Base Sepolia RPC — not from KeeperHub",
      "receipt.status === success asserted (fail-closed: anything else = not verified)",
      "Block number and gas usage recorded from the onchain receipt",
    ],
  },
  explorer: EXPLORER,
} as const;

type TabId = "summary" | "consent" | "execution" | "receipt" | "audit" | "raw";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "consent", label: "Consent" },
  { id: "execution", label: "Execution" },
  { id: "receipt", label: "Receipt" },
  { id: "audit", label: "Audit" },
  { id: "raw", label: "Raw JSON" },
];

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-quiet/50 py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`${mono ? "font-mono" : ""} break-all text-sm text-txt`}>{value}</span>
    </div>
  );
}

export function Capsule() {
  const [tab, setTab] = useState<TabId>("summary");
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/proof`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (permissions/insecure context) — no-op, honest
    }
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(PROOF, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "finaltab-settlement-capsule.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <p className="font-mono text-xs tracking-[0.25em] text-signal">SETTLEMENT CAPSULE</p>

      {/* hero card */}
      <div className="verified-pulse mt-4 rounded-xl border border-signal/40 bg-surface-1 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-signal/15 text-signal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M9 12l2 2 4-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-txt">VERIFIED SETTLEMENT</h1>
              <p className="text-sm text-muted">KeeperHub executed · Base Sepolia · receipt verified against RPC</p>
            </div>
          </div>
          <span className="rounded-full border border-signal/40 bg-signal/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-signal">
            success · verified
          </span>
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <Row label="Execution ID" value={PROOF.execution.executionId} />
          <Row label="Block" value={PROOF.transaction.blockNumber.toLocaleString("en-GB")} />
          <Row label="Chain" value={`${PROOF.network.chain} · ${PROOF.network.chainId}`} />
          <Row label="Gas used" value={PROOF.transaction.gasUsed.toLocaleString("en-GB")} />
        </div>
        <p className="mt-3 break-all font-mono text-xs text-faint">{TX}</p>
      </div>

      {/* actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="rounded-lg border border-quiet bg-surface-1 px-4 py-2 text-sm text-txt transition-colors hover:border-signal/50"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={downloadJson}
          className="rounded-lg border border-quiet bg-surface-1 px-4 py-2 text-sm text-txt transition-colors hover:border-signal/50"
        >
          Download JSON
        </button>
        <a
          href={EXPLORER}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.02]"
        >
          Open explorer ↗
        </a>
      </div>

      {/* tabs */}
      <div className="mt-8 flex gap-1 overflow-x-auto rounded-lg border border-quiet bg-surface-1 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-md px-3.5 py-1.5 text-sm transition-colors ${
              tab === t.id ? "bg-surface-2 text-signal" : "text-muted hover:text-txt"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-quiet bg-surface-1 p-5">
        {tab === "summary" ? (
          <div className="space-y-4">
            <p className="text-txt">
              This capsule is the proof record of a real KeeperHub execution on Base Sepolia.
              The transaction landed in block {PROOF.transaction.blockNumber.toLocaleString("en-GB")},
              and FINALTab&apos;s flight recorder verified the receipt independently against the RPC —
              it never takes KeeperHub&apos;s word for it.
            </p>
            <p className="text-sm text-muted">
              Every FINALTab settlement produces one of these. If verification cannot complete, the
              capsule says <span className="font-mono text-warn">UNPROVEN</span> — it never fakes a
              green tick.
            </p>
          </div>
        ) : null}

        {tab === "consent" ? (
          <div className="space-y-4">
            <p className="text-txt">
              FINALTab&apos;s consent model: the split is frozen into a canonical ledger, hashed, and
              every debtor signs an EIP-3009 <span className="font-mono text-sm">transferWithAuthorization</span> whose
              nonce derives from that ledger hash. Change anything after freeze and every signature dies.
              Nobody&apos;s money moves without their own signature over the exact final numbers.
            </p>
            <p className="text-sm text-muted">
              Honest note: this particular flight is an infrastructure proof — it demonstrates the
              KeeperHub execute-and-verify pipeline end to end. Contract-routed batch settlement with
              per-debtor EIP-3009 consent is built and tested (11 Hardhat tests) but awaits contract
              deployment gas on the org wallet.
            </p>
          </div>
        ) : null}

        {tab === "execution" ? (
          <div>
            <Row label="Provider" value={PROOF.execution.provider} mono={false} />
            <Row label="Execution ID" value={PROOF.execution.executionId} />
            <Row label="Status" value={PROOF.execution.status} />
            <Row label="Chain" value={`${PROOF.network.chain} (${PROOF.network.chainId})`} />
          </div>
        ) : null}

        {tab === "receipt" ? (
          <div>
            <Row label="Transaction hash" value={TX} />
            <Row label="Block number" value={PROOF.transaction.blockNumber.toLocaleString("en-GB")} />
            <Row label="Gas used" value={PROOF.transaction.gasUsed.toLocaleString("en-GB")} />
            <Row label="Receipt status" value={PROOF.transaction.receiptStatus} />
            <a
              href={EXPLORER}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-info hover:text-txt"
            >
              View on BaseScan ↗
            </a>
          </div>
        ) : null}

        {tab === "audit" ? (
          <div>
            <p className="text-sm text-muted">
              Verification method: {PROOF.verification.method}. Checks performed:
            </p>
            <ul className="mt-3 space-y-2.5">
              {PROOF.verification.checks.map((c) => (
                <li key={c} className="flex gap-2.5 text-sm text-txt">
                  <span className="mt-0.5 text-signal">✓</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === "raw" ? (
          <pre className="lab-scroll overflow-x-auto rounded-lg bg-canvas p-4 font-mono text-xs leading-relaxed text-muted">
            {JSON.stringify(PROOF, null, 2)}
          </pre>
        ) : null}
      </div>

      <p className="mt-6 text-center font-mono text-[11px] text-faint">
        Anyone can re-verify: <span className="text-muted">npx kh-proof verify {PROOF.execution.executionId}</span>
      </p>
    </div>
  );
}
