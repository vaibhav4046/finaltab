"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Panel, Badge, Button, ErrorNote, Spinner, BlockedNote } from "./ui";
import { signPreparedDebit, shortHex, formatUsdcMinor } from "@/lib/flow";
import { freezeReviewedLedger, reviewedReceiptId, type ReviewedSettlementBinding } from "@/lib/reviewGate";
import { apiErrorText, revertText } from "@/lib/apiText";
import type { Person, ExecutionStage, FrozenLedgerState, SignedTransfer } from "@/lib/types";
import { connectWallet, getConnectedAccounts, signMessage } from "@/lib/wallet";

interface ExecutionRailProps {
  cloudTabId: string;
  people: Person[];
  netted: Array<{ debtor: string; creditor: string; usdcMinor: string }>;
  review: ReviewedSettlementBinding | null;
  reviewInputKey: string;
  /** Source ledger currency. Freeze refuses anything but USD — USDC is USD-denominated. */
  currency: string;
  stage: ExecutionStage;
  onStage: (s: ExecutionStage) => void;
  onLocked: (locked: boolean) => void;
}

interface RailState {
  frozen: FrozenLedgerState | null;
  flowId: string | null;
  signed: SignedTransfer[] | null;
  executionId: string | null;
  proofCapability: string | null;
  verdict: string | null;
  simDetail: string | null;
  lastStatus: Record<string, unknown> | null;
}

interface DurableFlowSummary {
  id: string;
  runId: string;
  ledgerId: string;
  settlementRecordId: string;
  ledgerHash: string;
  settlementId: string;
  state: "frozen" | "simulated" | "submitted" | "completed_unverified" | "verified_settled" | "failed" | "timeout";
  revision: number;
  executionId: string | null;
  proofVerified: boolean;
  receiptCount: number;
  updatedAt: string;
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
  cloudTabId,
  people,
  netted,
  review,
  reviewInputKey,
  currency,
  stage,
  onStage,
  onLocked,
}: ExecutionRailProps) {
  const reduceMotion = useReducedMotion();
  const [rail, setRail] = useState<RailState>({
    frozen: null,
    flowId: null,
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
  const [durableHistory, setDurableHistory] = useState<DurableFlowSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewReady = reviewedReceiptId(review, reviewInputKey) !== null;

  const nameOfAddress = useCallback(
    (addr: string) => people.find((p) => p.address.toLowerCase() === addr.toLowerCase())?.name ?? shortHex(addr, 4),
    [people],
  );

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const rememberFlow = useCallback((flow: DurableFlowSummary) => {
    setDurableHistory((current) => [flow, ...current.filter((item) => item.id !== flow.id)].slice(0, 10));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const query = new URLSearchParams({ tabId: cloudTabId, limit: "10" });
        const response = await fetch(`/api/settlement-flow?${query.toString()}`, { signal: controller.signal });
        const body = await response.json() as { flows?: DurableFlowSummary[]; message?: string };
        if (!response.ok) throw new Error(body.message ?? "Durable settlement history is unavailable.");
        setDurableHistory(Array.isArray(body.flows) ? body.flows : []);
        setHistoryError(null);
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setHistoryError(loadError instanceof Error ? loadError.message : "Durable settlement history is unavailable.");
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [cloudTabId]);

  const doFreeze = async () => {
    setError(null);
    setBlocked(null);
    setBusy(true);
    try {
      if (netted.length === 0) throw new Error("Net the debts first; nothing is available to freeze.");
      if (!review) throw new Error("Complete the attested four-stage review before freezing.");
      const expectedFrozen = freezeReviewedLedger(people, netted, review, currency, reviewInputKey);
      const response = await fetch("/api/settlement-flow/freeze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: review.runId,
          inputHash: review.inputHash,
          receiptId: review.durableReceiptId,
          allocationId: review.allocationId,
          expectedFrozen,
        }),
      });
      const body = await response.json() as {
        frozen?: FrozenLedgerState;
        flow?: DurableFlowSummary;
        message?: string;
      };
      if (!response.ok || !body.frozen || !body.flow) {
        throw new Error(body.message ?? "The reviewed ledger could not be committed durably.");
      }
      setRail((current) => ({
        ...current,
        frozen: body.frozen!,
        flowId: body.flow!.id,
        signed: null,
        executionId: null,
        proofCapability: null,
        verdict: null,
        simDetail: null,
      }));
      rememberFlow(body.flow);
      onStage("frozen");
      onLocked(true);
    } catch (freezeError) {
      setError(freezeError instanceof Error ? freezeError.message : "Freeze failed");
    } finally {
      setBusy(false);
    }
  };

  const doUnfreeze = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setRail({ frozen: null, flowId: null, signed: null, executionId: null, proofCapability: null, verdict: null, simDetail: null, lastStatus: null });
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
      const signed = [...already, await signPreparedDebit(people, rail.frozen, already.length)];
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
    const signature = await signMessage(approver, message);
    if (!signature) throw new Error("Broadcast approval was cancelled. Nothing was submitted.");
    return signature;
  };

  const doSimulate = async () => {
    if (!rail.frozen || !rail.signed || !rail.flowId) return;
    setBusy(true);
    setError(null);
    setBlocked(null);
    onStage("simulating");
    try {
      const res = await fetch("/api/settlement-flow/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId: rail.flowId, signedSettlement: settleBody() }),
      });
      const json = await res.json() as {
        flow?: DurableFlowSummary;
        detail?: unknown;
        message?: string;
      };
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
      if (!json.flow) throw new Error("Simulation passed but its durable transition was not returned.");
      rememberFlow(json.flow);
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
    (flowId: string) => {
      const tick = async () => {
        try {
          const res = await fetch("/api/settlement-flow/status", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ flowId }),
          });
          const json = await res.json() as {
            verdict?: string | { verdict?: string };
            status?: Record<string, unknown>;
            flow?: DurableFlowSummary;
            pollHintMs?: number | null;
          };
          if (!res.ok) {
            setError(apiErrorText(json, `Status check failed (HTTP ${res.status})`));
            onStage("unproven");
            return;
          }
          // classifyExecution returns an object: { verdict: "VERIFIED_SETTLED", receipts: [...] }.
          // Accept a bare string too so an older API shape cannot strand the rail in "pending".
          const verdict: string | null =
            typeof json.verdict === "string" ? json.verdict : (json.verdict?.verdict ?? null);
          setRail((r) => ({ ...r, verdict, lastStatus: json.status ?? null }));
          if (json.flow) rememberFlow(json.flow);
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
    [onStage, rememberFlow],
  );

  const doExecute = async () => {
    if (!rail.frozen || !rail.signed || !rail.flowId) return;
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

      const res = await fetch("/api/settlement-flow/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowId: rail.flowId,
          signedSettlement: settleBody(),
          approval: { ...challengeJson.artifact, signature },
        }),
      });
      const json = await res.json() as {
        accepted?: { executionId?: string };
        proofCapability?: string;
        flow?: DurableFlowSummary;
        detail?: unknown;
        message?: string;
      };
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
      const executionId = json.accepted?.executionId ?? json.flow?.executionId;
      if (!executionId || !json.flow) throw new Error("KeeperHub accepted the call but durable execution evidence is missing.");
      const proofCapability = typeof json.proofCapability === "string" ? json.proofCapability : null;
      setRail((r) => ({ ...r, executionId, proofCapability }));
      rememberFlow(json.flow);
      onStage("pending");
      pollStatus(rail.flowId);
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
                      <Button onClick={() => void doFreeze()} disabled={netted.length === 0 || !reviewReady || busy}>
                        {busy ? "Persisting…" : "Freeze durably"}
                      </Button>
                    ) : (
                      <div className="space-y-1 rounded-md border border-edge bg-panel-2 p-2.5">
                        <p className="font-mono text-[9px] uppercase tracking-wider text-fog-dim">ledgerHash</p>
                        <p className="break-all font-mono text-[10px] text-paper-dim">{rail.frozen.ledgerHash}</p>
                        <p className="pt-1 font-mono text-[9px] uppercase tracking-wider text-fog-dim">settlementId</p>
                        <p className="break-all font-mono text-[10px] text-paper-dim">{rail.frozen.settlementId}</p>
                        <div className="pt-1.5">
                          <Button variant="ghost" onClick={doUnfreeze}>
                            Start revised plan · retain audit record
                          </Button>
                        </div>
                      </div>
                    )}
                    {(netted.length === 0 || !reviewReady) && !rail.frozen && (
                      <p className="mt-1 font-mono text-[9px] text-fog-dim">
                        {!reviewReady ? "complete the attested agent review first" : "net the debts in panel 02 first"}
                      </p>
                    )}
                  </div>
                )}

                {s.key === "sign" && rail.frozen && (
                  <div className="mt-1.5">
                    {!rail.signed || rail.signed.length < rail.frozen.debits.length ? (
                      <Button onClick={() => void doSign()} disabled={busy}>
                        {busy
                          ? "Waiting for wallet…"
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
                        initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={reduceMotion ? { duration: 0 } : undefined}
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

      {durableHistory.length > 0 && (
        <details className="mt-3 rounded-md border border-info/25 bg-info/5 p-2.5">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-info">
            Refresh-safe history · {durableHistory.length} attested record{durableHistory.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 space-y-2">
            {durableHistory.map((flow) => (
              <div key={flow.id} className="rounded-md border border-edge bg-panel-2 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-paper">
                    {flow.state.replaceAll("_", " ")}
                  </span>
                  <span className="font-mono text-[9px] text-fog-dim">revision {flow.revision}/4</span>
                </div>
                <p className="mt-1 break-all font-mono text-[9px] text-fog">ledger {flow.ledgerHash}</p>
                {flow.executionId ? <p className="mt-1 break-all font-mono text-[9px] text-fog">execution {flow.executionId}</p> : null}
                <p className="mt-1 font-mono text-[9px] text-fog-dim">
                  {flow.proofVerified ? `independently verified · ${flow.receiptCount} receipt${flow.receiptCount === 1 ? "" : "s"}` : "proof not verified"}
                  {" · "}{new Date(flow.updatedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
      {historyError ? <p className="mt-2 font-mono text-[9px] text-warn">History unavailable: {historyError}</p> : null}

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
