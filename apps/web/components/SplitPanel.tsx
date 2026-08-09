"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { nettedTransfers, type Debt } from "@finaltab/engine";
import { Panel, Badge, Button, ErrorNote, Spinner, BlockedNote, Mono } from "./ui";
import { formatUsdcMinor, shortHex } from "@/lib/flow";
import type { Person, ReceiptState, AllocationState } from "@/lib/types";

interface SplitPanelProps {
  people: Person[];
  receipt: ReceiptState | null;
  allocation: AllocationState | null;
  payerId: string;
  locked: boolean;
  onPayer: (id: string) => void;
  onAllocation: (next: AllocationState | null) => void;
  onNetted: (netted: Array<{ debtor: string; creditor: string; usdcMinor: string }>) => void;
}

function fiatMinorToDisplay(minor: string, currency: string): string {
  const v = BigInt(minor);
  return `${currency} ${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`;
}

/** "42.5" | "42.50" | "42" → minor units string. Schema guarantees ≤2 decimals. */
function fiatStringToMinor(s: string): string {
  const [whole, frac = ""] = s.split(".");
  return (BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0") || "0")).toString();
}

export function SplitPanel({
  people,
  receipt,
  allocation,
  payerId,
  locked,
  onPayer,
  onAllocation,
  onNetted,
}: SplitPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [showNetted, setShowNetted] = useState(false);

  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? id;
  }, [people]);

  const netted = useMemo(() => {
    if (!allocation) return [];
    const debts: Debt[] = allocation.debts.map((d) => ({
      debtor: d.debtor,
      creditor: d.creditor,
      amount: BigInt(d.usdcMinor),
    }));
    return nettedTransfers(debts).map((d) => ({
      debtor: d.debtor,
      creditor: d.creditor,
      usdcMinor: d.amount.toString(),
    }));
  }, [allocation]);

  const allocate = async () => {
    if (!receipt) return;
    setBusy(true);
    setError(null);
    setIssues([]);
    setBlocked(null);
    setShowNetted(false);
    try {
      const res = await fetch("/api/vision/allocate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          receipt: receipt.receipt,
          participants: people.map((p) => ({ id: p.id, name: p.name })),
          payerId,
          instruction,
        }),
      });
      const json = await res.json();
      if (res.status === 501) {
        setBlocked(json.error ?? "Allocation is not configured.");
        return;
      }
      if (res.status === 422) {
        setIssues(json.issues ?? ["Allocation could not be reconciled."]);
        onAllocation(null);
        return;
      }
      if (!res.ok) {
        setError(json.error ?? `Allocation failed (HTTP ${res.status})`);
        return;
      }
      onAllocation({ proposal: json.proposal, shares: json.shares, debts: json.debts });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Allocation failed");
    } finally {
      setBusy(false);
    }
  };

  const currency = receipt?.receipt.currency ?? "";
  const active = showNetted ? netted : (allocation?.debts ?? []);

  const sharesTotalMinor = useMemo(() => {
    if (!allocation) return null;
    return allocation.shares.reduce((acc, s) => acc + BigInt(s.fiatMinor), 0n).toString();
  }, [allocation]);
  const receiptTotalMinor = receipt ? fiatStringToMinor(receipt.receipt.total) : null;

  return (
    <Panel title="Split & Graph" step="02 · Allocate">
      <div className="space-y-4">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fog-dim">Table</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={locked}
                onClick={() => onPayer(p.id)}
                className={`rounded-md border px-3 py-1.5 text-left transition-colors disabled:cursor-not-allowed ${
                  p.id === payerId ? "border-lime/50 bg-lime/10" : "border-edge bg-panel-2 hover:border-fog"
                }`}
              >
                <span className={`block font-mono text-xs font-semibold ${p.id === payerId ? "text-lime" : "text-paper"}`}>
                  {p.name}
                  {p.id === payerId ? " · paid" : ""}
                </span>
                <span className="block font-mono text-[9px] text-fog-dim">{shortHex(p.address, 4)}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-mono text-[9px] text-warn">
            ⚠ Demo mode. Connect a real wallet (MetaMask) in /auth for real settlement.
          </p>
        </div>

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fog-dim">Who had what — plain English</p>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={locked || busy}
            rows={3}
            className="w-full resize-none rounded-md border border-edge bg-panel-2 p-3 font-sans text-sm text-paper placeholder:text-fog-dim focus:border-lime/50 focus:outline-none disabled:opacity-60"
            placeholder="e.g. Vee had the daal, Hem and Ravi shared the lamb, split service evenly"
          />
          <div className="mt-2 flex items-center gap-3">
            <Button onClick={() => void allocate()} disabled={!receipt || busy || locked}>
              {busy ? "Reconciling…" : allocation ? "Re-allocate" : "Allocate"}
            </Button>
            {busy && <Spinner />}
            {!receipt && <Mono dim>upload a receipt first</Mono>}
          </div>
        </div>

        {issues.length > 0 && (
          <div className="rounded-md border border-coral/30 bg-coral/5 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-coral">Reconciler rejected the proposal</p>
            <ul className="mt-1.5 space-y-1">
              {issues.map((iss, i) => (
                <li key={i} className="font-mono text-[11px] text-coral/90">
                  {iss}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-mono text-[10px] text-fog">
              Nothing was accepted. The model only proposes — the deterministic engine decides.
            </p>
          </div>
        )}

        {allocation && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fog-dim">Shares — cent-perfect</p>
              <Badge tone="lime">Σ = receipt total</Badge>
            </div>
            <table className="w-full">
              <tbody>
                {allocation.shares.map((s) => (
                  <tr key={s.id} className="border-b border-edge-soft last:border-0">
                    <td className="py-1.5 font-mono text-xs text-paper">
                      {nameOf(s.id)}
                      {s.id === payerId && <span className="ml-1.5 text-[9px] text-lime">PAID</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs tabular-nums text-paper-dim">
                      {fiatMinorToDisplay(s.fiatMinor, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sharesTotalMinor !== null && receiptTotalMinor !== null && (
              <p className="mt-2 flex items-baseline gap-2 font-mono text-[10px] text-fog-dim">
                <span className="text-fog">
                  Σ shares {fiatMinorToDisplay(sharesTotalMinor, currency)}
                </span>
                <span className="leader flex-1" aria-hidden="true" />
                <span className={sharesTotalMinor === receiptTotalMinor ? "text-lime" : "text-coral"}>
                  {sharesTotalMinor === receiptTotalMinor
                    ? `= receipt ${fiatMinorToDisplay(receiptTotalMinor, currency)} · reconciled to the cent`
                    : `≠ receipt ${fiatMinorToDisplay(receiptTotalMinor, currency)} — reconciler would have rejected this`}
                </span>
              </p>
            )}
          </div>
        )}

        {allocation && allocation.debts.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fog-dim">
                {showNetted ? "Netted transfers" : "Debt graph"}
              </p>
              <div className="flex items-center gap-2">
                <Badge tone="fog">
                  {showNetted ? `${netted.length} transfer${netted.length === 1 ? "" : "s"}` : `${allocation.debts.length} debt${allocation.debts.length === 1 ? "" : "s"}`}
                </Badge>
                <Button
                  variant="ghost"
                  disabled={locked}
                  onClick={() => {
                    const next = !showNetted;
                    setShowNetted(next);
                    if (next) onNetted(netted);
                  }}
                >
                  {showNetted ? "Show raw" : "Net it"}
                </Button>
              </div>
            </div>
            <AnimatePresence mode="popLayout">
              <div className="space-y-1.5">
                {active.map((d) => (
                  <motion.div
                    key={`${showNetted ? "n" : "r"}-${d.debtor}-${d.creditor}`}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center justify-between rounded-md border border-edge bg-panel-2 px-3 py-2"
                  >
                    <span className="font-mono text-xs text-paper">
                      {nameOf(d.debtor)} <span className="text-fog-dim">→</span> {nameOf(d.creditor)}
                    </span>
                    <span className="font-mono text-xs font-semibold tabular-nums text-lime">
                      {formatUsdcMinor(d.usdcMinor)} USDC
                    </span>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
            {!showNetted && (
              <p className="mt-1.5 font-mono text-[9px] text-fog-dim">
                Fiat shares convert to USDC at 1:1 face value (test USDC on Base Sepolia). Net it to minimize transfers, then freeze.
              </p>
            )}
            {showNetted && (
              <p className="mt-1.5 font-mono text-[9px] text-fog-dim">
                Same money, fewest transfers. Freeze on the right to lock this into a canonical ledger.
              </p>
            )}
          </div>
        )}

        {error && <ErrorNote message={error} />}
        {blocked && <BlockedNote message={blocked} />}
      </div>
    </Panel>
  );
}
