"use client";

import { useEffect, useState } from "react";
import { ReceiptPanel } from "./ReceiptPanel";
import { SplitPanel } from "./SplitPanel";
import { ExecutionRail } from "./ExecutionRail";
import { FundingPanel } from "./FundingPanel";
import { parseFiat } from "@finaltab/engine";
import { makeDemoPeople } from "@/lib/flow";
import { recordTab } from "@/lib/identity";
import type { Person, ReceiptState, AllocationState, ExecutionStage } from "@/lib/types";

export function Lab() {
  // Demo signers are generated client-side only — render nothing address-
  // dependent until after mount so SSR and client HTML agree.
  const [people, setPeople] = useState<Person[] | null>(null);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [receiptNonce, setReceiptNonce] = useState<string | null>(null);
  const [payerId, setPayerId] = useState("vee");
  const [allocation, setAllocation] = useState<AllocationState | null>(null);
  const [netted, setNetted] = useState<Array<{ debtor: string; creditor: string; usdcMinor: string }>>([]);
  const [stage, setStage] = useState<ExecutionStage>("idle");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setPeople(makeDemoPeople());
  }, []);

  // The contract burns each settlementId forever, and settlementId derives from
  // the canonical ledger (people + receiptId + amounts). A per-extraction nonce
  // keeps the same dinner extracted twice from colliding with a burned id.
  const receiptId = receipt
    ? `receipt-${receipt.receipt.merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${receiptNonce ? `-${receiptNonce}` : ""}`
    : null;

  // Record tab history for the signed-in device profile. Same receipt id
  // dedupes, so a DRAFT upgrades in place when the chain verdict arrives.
  useEffect(() => {
    if (!receipt || !allocation || !people || !receiptId) return;
    const verdict =
      stage === "verified" ? "VERIFIED_SETTLED" : stage === "failed" ? "FAILED" : "DRAFT";
    recordTab({
      id: receiptId,
      merchant: receipt.receipt.merchant,
      totalMinor: parseFiat(receipt.receipt.total).toString(),
      currency: receipt.receipt.currency,
      people: people.map((p) => p.name),
      verdict,
      at: new Date().toISOString(),
    });
  }, [receipt, allocation, people, stage, receiptId]);

  if (!people) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="font-mono text-xs text-fog">generating demo signers…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 md:px-6">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReceiptPanel
          receipt={receipt}
          onReceipt={(next) => {
            if (locked) return;
            setReceipt(next);
            setReceiptNonce(
              Array.from(crypto.getRandomValues(new Uint8Array(4)))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(""),
            );
            setAllocation(null);
            setNetted([]);
            setStage("idle");
          }}
        />
        <SplitPanel
          people={people}
          receipt={receipt}
          allocation={allocation}
          payerId={payerId}
          locked={locked}
          onPayer={setPayerId}
          onAllocation={(next) => {
            setAllocation(next);
            setNetted([]);
          }}
          onNetted={setNetted}
        />
        <ExecutionRail
          people={people}
          netted={netted}
          receiptId={receiptId}
          currency={receipt?.receipt.currency ?? ""}
          stage={stage}
          onStage={setStage}
          onLocked={setLocked}
        />
      </div>

      <div className="mt-4">
        <FundingPanel people={people} />
      </div>
    </div>
  );
}
