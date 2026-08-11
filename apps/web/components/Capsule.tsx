"use client";

import { useCallback, useEffect, useState } from "react";

interface Receipt {
  hash: string;
  chainId: number;
  verified: boolean;
  receiptStatus: string;
  blockNumber?: number;
  gasUsed?: string;
}

interface ProofPayload {
  status: {
    executionId: string;
    status: string;
    sponsored?: boolean;
    transactionHash?: string;
    receipts?: Receipt[];
    [key: string]: unknown;
  };
  verdict: { verdict: "PENDING" | "VERIFIED_SETTLED" | "FAILED" | "UNPROVEN"; reason?: string };
  keeperHubVerdict?: { verdict: string; reason?: string };
  independent: null | {
    method: string;
    checkedAt: string;
    verified: boolean;
    receipts: Array<{
      hash: string;
      verified: boolean;
      reason: string;
      blockNumber?: number;
      confirmations?: number;
      contractLogFound?: boolean;
      settlementBindingFound?: boolean;
      observedSettlementId?: string;
      observedLedgerHash?: string;
    }>;
  };
  pollHintMs?: number | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-quiet/50 py-3 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="break-all text-right font-mono text-sm text-txt">{value}</span>
    </div>
  );
}

export function Capsule({
  executionId,
  settlementId,
  ledgerHash,
}: {
  executionId?: string;
  settlementId?: string;
  ledgerHash?: string;
}) {
  const [lookup, setLookup] = useState(executionId ?? "");
  const [settlementLookup, setSettlementLookup] = useState(settlementId ?? "");
  const [ledgerLookup, setLedgerLookup] = useState(ledgerHash ?? "");
  const [proof, setProof] = useState<ProofPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(executionId));
  const [copied, setCopied] = useState(false);
  const [proofCapability, setProofCapability] = useState<string | null>(null);
  const [capabilityReady, setCapabilityReady] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setProofCapability(fragment.get("proof"));
    setCapabilityReady(true);
  }, []);

  const load = useCallback(async () => {
    if (!executionId || !settlementId || !ledgerHash || !capabilityReady) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ settlementId, ledgerHash });
      const response = await fetch(
        `/api/settle/status/${encodeURIComponent(executionId)}?${query.toString()}`,
        {
          cache: "no-store",
          headers: proofCapability ? { "x-finaltab-proof-capability": proofCapability } : undefined,
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Proof lookup failed (${response.status}).`);
      setProof(body as ProofPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Proof lookup failed.");
    } finally {
      setLoading(false);
    }
  }, [capabilityReady, executionId, ledgerHash, proofCapability, settlementId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!executionId || !settlementId || !ledgerHash || proof?.verdict.verdict !== "PENDING") return;
    const timer = setTimeout(() => void load(), Math.max(1500, proof.pollHintMs ?? 3000));
    return () => clearTimeout(timer);
  }, [executionId, ledgerHash, load, proof, settlementId]);

  const lookupForm = (
    <form
      className="mt-7 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const bytes32 = /^0x[0-9a-fA-F]{64}$/;
        if (!/^[A-Za-z0-9_-]{6,128}$/.test(lookup)) {
          setError("Enter a valid KeeperHub execution ID.");
          return;
        }
        if (!bytes32.test(settlementLookup) || !bytes32.test(ledgerLookup)) {
          setError("Enter the exact bytes32 settlementId and ledgerHash from the frozen plan.");
          return;
        }
        const query = new URLSearchParams({ settlementId: settlementLookup, ledgerHash: ledgerLookup });
        window.location.assign(`/app/proof/${encodeURIComponent(lookup)}?${query.toString()}`);
      }}
    >
      <label htmlFor="execution-id" className="sr-only">KeeperHub execution ID</label>
      <input
        id="execution-id"
        value={lookup}
        onChange={(event) => setLookup(event.target.value)}
        placeholder="KeeperHub execution ID"
        className="min-h-12 flex-1 rounded-xl border border-quiet bg-surface-1 px-4 font-mono text-base text-txt outline-none focus-visible:ring-2 focus-visible:ring-signal"
      />
      <label htmlFor="settlement-id" className="sr-only">Frozen settlement ID</label>
      <input
        id="settlement-id"
        value={settlementLookup}
        onChange={(event) => setSettlementLookup(event.target.value)}
        placeholder="0x… settlementId"
        autoComplete="off"
        spellCheck={false}
        className="min-h-12 rounded-xl border border-quiet bg-surface-1 px-4 font-mono text-sm text-txt outline-none focus-visible:ring-2 focus-visible:ring-signal"
      />
      <label htmlFor="ledger-hash" className="sr-only">Frozen ledger hash</label>
      <input
        id="ledger-hash"
        value={ledgerLookup}
        onChange={(event) => setLedgerLookup(event.target.value)}
        placeholder="0x… ledgerHash"
        autoComplete="off"
        spellCheck={false}
        className="min-h-12 rounded-xl border border-quiet bg-surface-1 px-4 font-mono text-sm text-txt outline-none focus-visible:ring-2 focus-visible:ring-signal"
      />
      <button type="submit" className="min-h-12 rounded-xl bg-signal px-5 font-semibold text-ink">Verify now</button>
    </form>
  );

  if (!executionId || !settlementId || !ledgerHash) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-signal">LIVE PROOF LOOKUP</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-txt">Open a settlement capsule</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Enter the execution ID plus the frozen settlement and ledger hashes. FINALTab only verifies green when Base Sepolia contains the exact V2 event for those identifiers.
        </p>
        {lookupForm}
        {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
        <div className="mt-8 rounded-xl border border-info/30 bg-info/5 p-4 text-sm leading-relaxed text-muted">
          The former static showcase record was removed. A successful transaction from the same contract is not enough: both indexed V2 plan identifiers must match before this page displays green.
        </div>
      </div>
    );
  }

  if (loading && !proof) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted" role="status">Re-verifying KeeperHub and Base Sepolia…</div>;
  }
  if (error || !proof) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-warn">PROOF NOT VERIFIED</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-txt">Check the execution or try again</h1>
        <p className="mt-3 text-sm leading-6 text-danger" role="alert">{error ?? "No proof returned."}</p>
        <div className="mt-4 rounded-xl border border-quiet bg-surface-1 p-4 text-sm text-muted">
          No success is implied. The execution ID and both frozen-plan hashes remain editable below so a configuration error or mismatched proof never strands the lookup.
        </div>
        {lookupForm}
        <button type="button" onClick={() => void load()} className="mt-3 min-h-11 rounded-lg border border-quiet px-4 text-txt">Retry current proof</button>
      </div>
    );
  }

  const verdict = proof.verdict.verdict;
  const verified = verdict === "VERIFIED_SETTLED" && proof.independent?.verified === true;
  const receipt = proof.status.receipts?.[0];
  const txHash = receipt?.hash ?? proof.status.transactionHash ?? null;
  const explorer = txHash ? `https://sepolia.basescan.org/tx/${txHash}` : null;
  const tone = verified
    ? { border: "border-signal/40", background: "bg-signal/10", text: "text-signal" }
    : verdict === "FAILED"
      ? { border: "border-danger/40", background: "bg-danger/10", text: "text-danger" }
      : { border: "border-warn/40", background: "bg-warn/10", text: "text-warn" };

  const download = () => {
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `finaltab-proof-${executionId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <p className="font-mono text-xs tracking-[0.25em] text-signal">SETTLEMENT CAPSULE · LIVE</p>
      <section className={`mt-4 rounded-2xl border ${tone.border} bg-surface-1 p-6`} aria-labelledby="proof-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 id="proof-title" className="text-2xl font-semibold tracking-tight text-txt">
              {verified ? "Verified settlement" : verdict === "PENDING" ? "Settlement pending" : verdict === "FAILED" ? "Settlement failed" : "Settlement unproven"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              KeeperHub execution plus independent receipt, V2 contract, settlementId, and ledgerHash verification.
            </p>
          </div>
          <span className={`rounded-full border ${tone.border} ${tone.background} px-3 py-1 font-mono text-xs uppercase tracking-wider ${tone.text}`}>
            {verdict.replaceAll("_", " ")}
          </span>
        </div>
        <div className="mt-5">
          <Row label="Execution ID" value={proof.status.executionId || executionId} />
          <Row label="KeeperHub status" value={proof.status.status} />
          <Row label="KeeperHub receipt gate" value={proof.keeperHubVerdict?.verdict ?? verdict} />
          <Row label="Independent RPC" value={proof.independent ? (proof.independent.verified ? "verified" : "not verified") : "waiting for terminal receipt"} />
          <Row label="Settlement ID" value={settlementId} />
          <Row label="Ledger hash" value={ledgerHash} />
          {receipt?.blockNumber ? <Row label="Block" value={receipt.blockNumber.toLocaleString("en-GB")} /> : null}
          <Row label="Gas sponsorship" value={proof.status.sponsored ? "KeeperHub sponsored" : "not reported"} />
          {txHash ? <Row label="Transaction" value={txHash} /> : null}
        </div>
        {proof.verdict.reason ? <p className="mt-4 rounded-lg border border-quiet bg-canvas p-3 text-sm text-muted">{proof.verdict.reason}</p> : null}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="min-h-11 rounded-lg border border-quiet bg-surface-1 px-4 text-sm text-txt"
        >
          {copied ? "Copied" : "Copy proof link"}
        </button>
        <button type="button" onClick={download} className="min-h-11 rounded-lg border border-quiet bg-surface-1 px-4 text-sm text-txt">Download JSON</button>
        {explorer ? <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-signal px-4 text-sm font-semibold text-ink">Open BaseScan ↗</a> : null}
      </div>

      <section className="mt-8 rounded-2xl border border-quiet bg-surface-1 p-5" aria-labelledby="audit-title">
        <h2 id="audit-title" className="text-lg font-semibold text-txt">Independent audit checks</h2>
        {proof.independent?.receipts.length ? (
          <ul className="mt-4 space-y-3">
            {proof.independent.receipts.map((item) => (
              <li key={item.hash} className="rounded-xl border border-quiet bg-canvas p-4">
                <p className={`font-mono text-xs font-semibold ${item.verified ? "text-signal" : "text-warn"}`}>{item.verified ? "PASS" : "NOT PROVEN"}</p>
                <p className="mt-2 break-all font-mono text-xs text-muted">{item.hash}</p>
                <p className="mt-2 text-sm text-txt">{item.reason}</p>
                <p className="mt-2 text-xs text-muted">
                  Confirmations: {item.confirmations ?? "unknown"} · settlement event: {item.contractLogFound ? "found" : "not found"} · exact plan: {item.settlementBindingFound ? "matched" : "not matched"}
                </p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-muted">No terminal receipt exists yet.</p>}
      </section>

      <details className="mt-6 rounded-xl border border-quiet bg-surface-1 p-4">
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-muted">Raw live proof JSON</summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-canvas p-4 font-mono text-xs text-muted">{JSON.stringify(proof, null, 2)}</pre>
      </details>
    </div>
  );
}
