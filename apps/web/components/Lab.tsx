"use client";

import { useEffect, useState } from "react";
import { ReceiptPanel } from "./ReceiptPanel";
import { SplitPanel } from "./SplitPanel";
import { ExecutionRail } from "./ExecutionRail";
import { makeDemoPeople } from "@/lib/flow";
import type { Person, ReceiptState, AllocationState, ExecutionStage } from "@/lib/types";

export function Lab() {
  // Demo signers are generated client-side only — render nothing address-
  // dependent until after mount so SSR and client HTML agree.
  const [people, setPeople] = useState<Person[] | null>(null);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [payerId, setPayerId] = useState("vee");
  const [allocation, setAllocation] = useState<AllocationState | null>(null);
  const [netted, setNetted] = useState<Array<{ debtor: string; creditor: string; usdcMinor: string }>>([]);
  const [stage, setStage] = useState<ExecutionStage>("idle");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setPeople(makeDemoPeople());
  }, []);

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
          <h1 className="font-mono text-lg font-bold tracking-tight text-paper">
            FINAL<span className="text-lime">Tab</span>
          </h1>
          <p className="mt-0.5 font-sans text-sm text-fog">
            Settle the table. Prove it onchain — or say honestly that you couldn&apos;t.
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-fog-dim">
          Base Sepolia · USDC · KeeperHub execution
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReceiptPanel
          receipt={receipt}
          onReceipt={(next) => {
            if (locked) return;
            setReceipt(next);
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
          receiptId={receipt ? `receipt-${receipt.receipt.merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : null}
          stage={stage}
          onStage={setStage}
          onLocked={setLocked}
        />
      </div>
    </div>
  );
}
