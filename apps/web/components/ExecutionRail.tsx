"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { privateKeyToAccount } from "viem/accounts";
import { Panel, Badge, Button, ErrorNote, Spinner, BlockedNote } from "./ui";
import { freezeLedger, signAllTransfers, signPreparedDebit, shortHex, formatUsdcMinor } from "@/lib/flow";
import { apiErrorText, revertText } from "@/lib/apiText";
import type { Person, ExecutionStage, FrozenLedgerState, SignedTransfer } from "@/lib/types";
import { connectWallet, getConnectedAccounts, signMessage } from "@/lib/wallet";

interface ExecutionRailProps {
  people: Person[];
  netted: Array<{ debtor: string; creditor: string; usdcMinor: string }>;
  receiptId: string | null;
  /** Source ledger currency. Freeze refuses anything but USD — USDC is USD-denominated. */
  currency: string;
  stage: ExecutionStage;
  onStage: (s: ExecutionStage) => void;
  onLocked: (locked: boolean) => void;
}

interface RailState {
  frozen: FrozenLedgerState | null;
  signed: SignedTransfer[] | null;
  executionId: string | null;
  proofCapability: string | null;
  verdict: string | null;
  simDetail: string | null;
  lastStatus: Record<string, unknown> | null;
}

const STAGE_LABELS: Array<{ key: string; label: string }> = [
  { key: "freeze", label: "Freeze ledger" },
  { key: "sign", label: "Approve pull + payout plan" },
  { key: "simulate", label: "Simulate" },
  { key: "execute", label: "Execute via KeeperHub" },
  { key: "verify", label: "Verify receipt" },
];

function stageIndex(stage: ExecutionStage): number {
  switch (stage) {
    case "idle":
      return -1;
    case "frozen":
      return 0;
    case "signed":
      return 1;
    case "simulating":
    case "sim_failed":
      return 2;
    case "executing":
    case "pending":
      return 3;
    case "verified":
    case "failed":
    case "unproven":
      return 4;
    default:
      return -1;
  }
}

export function ExecutionRail({
  people,
  netted,
  receiptId,
  currency,
  stage,
  onStage,
  onLocked,
}: ExecutionRailProps) {
  const [rail, setRail] = useState<RailState>({
    frozen: null,
    signed: null,
    executionId: null,
    proofCapability: null,
    verdict: null,
    simDetail: null,
    lastStatus: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nameOfAddress = useCallback(
    (addr: string) => people.find((p) => p.address.toLowerCase() === addr.toLowerCase())?.name ?? shortHex(addr, 4),
    [people],
  );

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  // Any change to the inputs after freeze invalidates everything downstream.
  useEffect(() => {
    if (stage !== "idle" && stage !== "verified" && stage !== "failed" && stage !== "unproven") return;
    // no-op: freeze locks upstream panels instead
  }, [stage]);

  const doFreeze = () => {
    setError(null);
    setBlocked(null);
    try {
      if (netted.length === 0) throw new Error("Net the debts first — nothing to freeze.");
      const frozen = freezeLedger(people, netted, receiptId ?? "receipt-1", currency);
      setRail((r) => ({ ...r, frozen, signed: null, executionId: null, proofCapability: null, verdict: null, simDetail: null }));
      onStage("frozen");
      onLocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Freeze failed");
    }
  };

  const doUnfreeze = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setRail({ frozen: null, signed: null, executionId: null, proofCapability: null, verdict: null, simDetail: null, lastStatus: null });
    setError(null);
    setBlocked(null);
    onStage("idle");
    onLocked(false);
  };

  const doSign = async () => {
    if (!rail.frozen) return;
    setBusy(true);
    setError(null);
    try {
      const already = rail.signed ?? [];
      const allDemo = rail.frozen.debits.every((debit) =>
        people.some(
          (person) =>
            person.address.toLowerCase() === debit.debtor.toLowerCase() && Boolean(person.demoPrivateKey),
        ),
      );
      const signed = allDemo
        ? await signAllTransfers(people, rail.frozen)
        : [...already, await signPreparedDebit(people, rail.frozen, already.length)];
      setRail((current) => ({ ...current, signed }));
      if (signed.length === rail.frozen.debits.length) onStage("signed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signature collection failed.");
    } finally {
      setBusy(false);
    }
  };

  const settleBody = () => ({
    settlementId: rail.frozen!.settlementId,
    ledgerHash: rail.frozen!.ledgerHash,
    transfers: rail.signed!,
    // V2 planHash commits to these canonical, aggregated payouts.
    payouts: rail.frozen!.payouts,
  });

  const resolveBroadcastApprover = async (): Promise<`0x${string}`> => {
    const debtors = new Set((rail.signed ?? []).map((transfer) => transfer.from.toLowerCase()));
    const demoSigner = people.find(
      (person) => Boolean(person.demoPrivateKey) && debtors.has(person.address.toLowerCase()),
    );
    if (demoSigner) return demoSigner.address as `0x${string}`;

    let connected = await getConnectedAccounts();
    if (connected.length === 0) {
      const account = await connectWallet();
      connected = account ? [account.address] : [];
    }
    const approver = connected.find((address) => debtors.has(address.toLowerCase()));
    if (!approver) throw new Error("Connect any debtor wallet to approve this exact KeeperHub broadcast.");
    return approver as `0x${string}`;
  };

  const signBroadcastMessage = async (approver: `0x${string}`, message: string): Promise<`0x${string}`> => {
    const person = people.find((candidate) => candidate.address.toLowerCase() === approver.toLowerCase());
    if (person?.demoPrivateKey) {
      return privateKeyToAccount(person.demoPrivateKey).signMessage({ message });
    }
    const signature = await signMessage(approver, message);
    if (!signature) throw new Error("Broadcast approval was cancelled. Nothing was submitted.");
    return signature;
  };

  const doSimulate = async () => {
    if (!rail.frozen || !rail.signed) return;
    setBusy(true);
    setError(null);
    setBlocked(null);
    onStage("simulating");
    try {
      const res = await fetch("/api/settle/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settleBody()),
      });
      const json = await res.json();
      if (res.status === 501) {
        setBlocked(apiErrorText(json, "KeeperHub is not configured."));
        onStage("signed");
        return;
      }
      if (res.status === 409) {
        setRail((r) => ({ ...r, simDetail: revertText(json) }));
        onStage("sim_failed");
        return;
      }
      if (!res.ok) {
        setError(apiErrorText(json, `Simulation failed (HTTP ${res.status})`));
        onStage("signed");
        return;
      }
      setRail((r) => ({ ...r, simDetail: null }));
      onStage("simulating"); // stays here; execute button becomes available
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
      onStage("signed");
    } finally {
      setBusy(false);
    }
  };

  const pollStatus = useCallback(
    (executionId: string, settlementId: string, ledgerHash: string, proofCapability: string | null) => {
      const tick = async () => {
        try {
          const proofQuery = new URLSearchParams({ settlementId, ledgerHash });
          const res = await fetch(`/api/settle/status/${executionId}?${proofQuery.toString()}`, {
            headers: proofCapability ? { "x-finaltab-proof-capability": proofCapability } : undefined,
          });
          const json = await res.json();
          if (!res.ok) {
            setError(apiErrorText(json, `Status check failed (HTTP ${res.status})`));
            onStage("unproven");
            return;
          }
          // classifyExecution returns an object: { verdict: "VERIFIED_SETTLED", receipts: [...] }.
          // Accept a bare string too so an older API shape cannot strand the rail in "pending".
          const verdict: string | null =
            typeof json.verdict === "string" ? json.verdict : (json.verdict?.verdict ?? null);
          setRail((r) => ({ ...r, verdict, lastStatus: json.status }));
          if (verdict === "VERIFIED_SETTLED") {
            onStage("verified");
            return;
          }
          if (verdict === "FAILED") {
            onStage("failed");
            return;
          }
          if (verdict === "UNPROVEN") {
            onStage("unproven");
            return;
          }
          onStage("pending");
          pollTimer.current = setTimeout(tick, Math.max(1500, json.pollHintMs ?? 3000));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Status polling failed");
          onStage("unproven");
        }
      };
      void tick();
    },
    [onStage],
  );

  const doExecute = async () => {
    if (!rail.frozen || !rail.signed) return;
    setBusy(true);
    setError(null);
    setBlocked(null);
    onStage("executing");
    try {
      const approver = await resolveBroadcastApprover();
      const challengeRes = await fetch("/api/settle/approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settlementId: rail.frozen.settlementId,
          ledgerHash: rail.frozen.ledgerHash,
          approver,
        }),
      });
      const challengeJson = await challengeRes.json();
      if (challengeRes.status === 501) {
        setBlocked(apiErrorText(challengeJson, "V2 settlement submission is not configured."));
        onStage("simulating");
        return;
      }
      if (challengeRes.status === 403) {
        setBlocked(
          apiErrorText(
            challengeJson,
            "This account can prepare settlements but needs an explicit settlements:submit grant to move testnet USDC.",
          ),
        );
        onStage("simulating");
        return;
      }
      if (!challengeRes.ok) {
        setError(apiErrorText(challengeJson, `Approval challenge failed (HTTP ${challengeRes.status})`));
        onStage("simulating");
        return;
      }
      if (
        typeof challengeJson.message !== "string" ||
        !challengeJson.artifact ||
        typeof challengeJson.artifact !== "object"
      ) {
        throw new Error("Approval challenge response was malformed. Nothing was submitted.");
      }
      const signature = await signBroadcastMessage(approver, challengeJson.message);

      const res = await fetch("/api/settle/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signedSettlement: settleBody(),
          approval: { ...challengeJson.artifact, signature },
        }),
      });
      const json = await res.json();
      if (res.status === 501) {
        setBlocked(apiErrorText(json, "KeeperHub is not configured."));
        onStage("simulating");
        return;
      }
      if (res.status === 409) {
        setRail((r) => ({ ...r, simDetail: revertText(json) }));
        onStage("sim_failed");
        return;
      }
      if (!res.ok) {
        setError(apiErrorText(json, `Execute failed (HTTP ${res.status})`));
        onStage("simulating");
        return;
      }
      const executionId: string = json.accepted.executionId;
      const proofCapability = typeof json.proofCapability === "string" ? json.proofCapability : null;
      setRail((r) => ({ ...r, executionId, proofCapability }));
      onStage("pending");
      pollStatus(executionId, rail.frozen.settlementId, rail.frozen.ledgerHash, proofCapability);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Execute failed");
      onStage("simulating");
    } finally {
      setBusy(false);
    }
  };

  const idx = stageIndex(stage);
  const simOk = stage === "simulating" && rail.simDetail === null && !busy;

  return (
    <Panel title="Execution Rail" step="03 · Settle" accent={stage === "verified"}>
      <ol className="relative space-y-0">
        {STAGE_LABELS.map((s, i) => {
          const done = idx > i || stage === "verified";
          const current = idx === i && stage !== "verified";
          return (
            <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
              {i < STAGE_LABELS.length - 1 && (
                <span className={`rail-line absolute left-[7px] top-5 h-full w-px ${done ? "bg-lime/40" : "bg-edge"}`} />
              )}
              <span
                className={`relative z-10 mt-0.5 h-[15px] w-[15px] shrink-0 rounded-full border ${
                  done
                    ? "border-lime bg-lime/20"
                    : current
                      ? "border-paper bg-panel-2"
                      : "border-edge bg-panel"
                }`}
              >
                {done && <span className="absolute inset-[3px] rounded-full bg-lime" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-mono text-xs ${done ? "text-lime" : current ? "text-paper" : "text-fog-dim"}`}>
                  {s.label}
                </p>

                {s.key === "freeze" && (
                  <div className="mt-1.5">
                    {!rail.frozen ? (
                      <Button onClick={doFreeze} disabled={netted.length === 0}>
                        Freeze
                      </Button>
                    ) : (
                      <div className="space-y-1 rounded-md border border-edge bg-panel-2 p-2.5">
                        <p className="font-mono text-[9px] uppercase tracking-wider text-fog-dim">ledgerHash</p>
                        <p className="break-all font-mono text-[10px] text-paper-dim">{rail.frozen.ledgerHash}</p>
                        <p className="pt-1 font-mono text-[9px] uppercase tracking-wider text-fog-dim">settlementId</p>
                        <p className="break-all font-mono text-[10px] text-paper-dim">{rail.frozen.settlementId}</p>
                        <div className="pt-1.5">
                          <Button variant="ghost" onClick={doUnfreeze}>
                            Revise plan · discard approvals
                          </Button>
                        </div>
                      </div>
                    )}
                    {netted.length === 0 && !rail.frozen && (
                      <p className="mt-1 font-mono text-[9px] text-fog-dim">net the debts in panel 02 first</p>
                    )}
                  </div>
                )}

                {s.key === "sign" && rail.frozen && (
                  <div className="mt-1.5">
                    {!rail.signed || rail.signed.length < rail.frozen.debits.length ? (
                      <Button onClick={() => void doSign()} disabled={busy}>
                        {busy
                          ? "Waiting for wallet…"
                          : people.every((person) => person.demoPrivateKey)
                            ? `Run ${rail.frozen.debits.length} demo approval(s)`
                            : `Collect approval ${(rail.signed?.length ?? 0) + 1}/${rail.frozen.debits.length}`}
                      </Button>
                    ) : null}
                    {rail.signed && rail.signed.length > 0 ? (
                      <div className="space-y-1.5">
                        {rail.signed.map((t, i2) => (
                          <div key={i2} className="rounded-md border border-edge bg-panel-2 px-2.5 py-1.5">
                            <p className="font-mono text-[10px] text-paper">
                              {nameOfAddress(t.from)} approved{" "}
                              <span className="text-lime">{formatUsdcMinor(t.value)} USDC</span>
                            </p>
                            <p className="font-mono text-[9px] text-fog-dim">
                              USDC pull + complete payout-plan consent · nonce {shortHex(t.nonce, 5)}
                            </p>
                          </div>
                        ))}
                        <p className="font-mono text-[9px] text-fog-dim">
                          V2 recomputes the plan hash onchain. Any debtor, payout, amount, ledger, chain, or contract
                          change invalidates approval.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}

                {s.key === "simulate" && rail.signed?.length === rail.frozen?.debits.length && (
                  <div className="mt-1.5">
                    {stage === "sim_failed" ? (
                      <div className="rounded-md border border-coral/40 bg-coral/5 p-2.5">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-coral">
                          Would revert — not broadcast
                        </p>
                        <p className="mt-1 break-all font-mono text-[10px] text-coral/80">{rail.simDetail}</p>
                        <div className="mt-2">
                          <Button variant="ghost" onClick={() => void doSimulate()} disabled={busy}>
                            Retry simulation
                          </Button>
                        </div>
                      </div>
                    ) : simOk ? (
                      <Badge tone="lime">✓ simulation passed</Badge>
                    ) : (
                      <Button onClick={() => void doSimulate()} disabled={busy || idx > 2}>
                        {busy && stage === "simulating" ? "Simulating…" : "Simulate"}
                      </Button>
                    )}
                  </div>
                )}

                {s.key === "execute" && (simOk || idx >= 3) && (
                  <div className="mt-1.5">
                    {rail.executionId ? (
                      <div className="rounded-md border border-edge bg-panel-2 px-2.5 py-1.5">
                        <p className="font-mono text-[9px] uppercase tracking-wider text-fog-dim">execution id</p>
                        <p className="break-all font-mono text-[10px] text-paper-dim">{rail.executionId}</p>
                        {(stage === "pending" || stage === "executing") && (
                          <p className="mt-1 flex items-center gap-2 font-mono text-[10px] text-fog">
                            <Spinner /> polling KeeperHub…
                          </p>
                        )}
                      </div>
                    ) : (
                      <Button onClick={() => void doExecute()} disabled={busy || !simOk}>
                        {busy && stage === "executing" ? "Submitting…" : "Execute onchain"}
                      </Button>
                    )}
                  </div>
                )}

                {s.key === "verify" && idx >= 4 && (
                  <div className="mt-1.5">
                    {stage === "verified" && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-md border border-lime/50 bg-lime/10 p-3"
                      >
                        <p className="font-mono text-sm font-bold uppercase tracking-widest text-lime">
                          Verified settled
                        </p>
                        <p className="mt-1 font-mono text-[10px] leading-relaxed text-paper-dim">
                          Terminal success + onchain receipt exists + verified flag true. This banner only renders on
                          VERIFIED_SETTLED — there is no optimistic version of it.
                        </p>
                        {rail.executionId ? (
                          <a
                            href={`/app/proof/${encodeURIComponent(rail.executionId)}?${new URLSearchParams({
                              settlementId: rail.frozen?.settlementId ?? "",
                              ledgerHash: rail.frozen?.ledgerHash ?? "",
                            }).toString()}${rail.proofCapability ? `#proof=${encodeURIComponent(rail.proofCapability)}` : ""}`}
                            className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-lime/40 px-3 font-mono text-[10px] uppercase tracking-wider text-lime"
                          >
                            Open independently verified proof
                          </a>
                        ) : null}
                      </motion.div>
                    )}
                    {stage === "failed" && (
                      <div className="rounded-md border border-coral/40 bg-coral/5 p-3">
                        <p className="font-mono text-sm font-bold uppercase tracking-widest text-coral">Failed</p>
                        <p className="mt-1 font-mono text-[10px] text-coral/80">
                          KeeperHub reported terminal failure. Nothing settled.
                        </p>
                      </div>
                    )}
                    {stage === "unproven" && (
                      <div className="rounded-md border border-amber/40 bg-amber/5 p-3">
                        <p className="font-mono text-sm font-bold uppercase tracking-widest text-amber">Unproven</p>
                        <p className="mt-1 font-mono text-[10px] text-paper-dim">
                          Execution reached a terminal state but the receipt could not be verified. We do not call this
                          settled.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {rail.lastStatus !== null && stage !== "idle" && (
        <details className="mt-3 rounded-md border border-edge bg-panel-2 p-2.5">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-fog">
            Raw KeeperHub status
          </summary>
          <pre className="lab-scroll mt-2 max-h-48 overflow-auto font-mono text-[10px] leading-relaxed text-fog">
            {JSON.stringify(rail.lastStatus, null, 2)}
          </pre>
        </details>
      )}

      {error && <ErrorNote message={error} />}
      {blocked && <BlockedNote message={blocked} />}

      {stage === "idle" && netted.length === 0 && (
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-fog-dim">
          Nothing here is simulated UI. Every state — simulate, execute, verify — is a real KeeperHub API result, and
          the app refuses to show success it cannot prove.
        </p>
      )}
    </Panel>
  );
}
