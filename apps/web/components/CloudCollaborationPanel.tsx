"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clipboard, CloudOff, Link2, RefreshCw, ShieldAlert, UserPlus, Users } from "lucide-react";
import type { CloudApproval, CloudParticipant, CloudTabDetail } from "@/lib/cloudTabs";
import type { Person } from "@/lib/types";

interface Props {
  tabId: string;
  locked: boolean;
  onWalletParticipants: (people: Person[]) => void;
}

interface DetailResponse {
  ok?: boolean;
  tab?: CloudTabDetail;
  error?: string;
  message?: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function walletPeople(participants: CloudParticipant[]): Person[] {
  return participants.flatMap((participant) => participant.walletAddress
    ? [{ id: participant.id, name: participant.displayName, address: participant.walletAddress }]
    : []);
}

function approvalTone(status: CloudApproval["status"]): string {
  if (status === "signed") return "border-verified/35 bg-verified/10 text-verified";
  if (status === "pending") return "border-warn/35 bg-warn/10 text-warn";
  return "border-danger/35 bg-danger/10 text-danger";
}

export function CloudCollaborationPanel({ tabId, locked, onWalletParticipants }: Props) {
  const callbackRef = useRef(onWalletParticipants);
  const [tab, setTab] = useState<CloudTabDetail | null>(null);
  const [state, setState] = useState<"loading" | "disabled" | "signed-out" | "ready" | "error">("loading");
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [attachSelf, setAttachSelf] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ participantId: string; url: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    callbackRef.current = onWalletParticipants;
  }, [onWalletParticipants]);

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const sessionResponse = await fetch("/api/session", { cache: "no-store" });
      const session = await sessionResponse.json() as { configured: boolean; authenticated: boolean };
      if (!session.configured) {
        setState("disabled");
        return;
      }
      if (!session.authenticated) {
        setState("signed-out");
        return;
      }
      const response = await fetch(`/api/tabs/${tabId}`, { cache: "no-store" });
      const body = await response.json() as DetailResponse;
      if (response.status === 503 && body.error === "CLOUD_DISABLED") {
        setState("disabled");
        return;
      }
      if (response.status === 401) {
        setState("signed-out");
        return;
      }
      if (!response.ok || !body.tab) throw new Error(body.message ?? "Shared tab could not be loaded.");
      setTab(body.tab);
      setState("ready");
      if (!locked) callbackRef.current(walletPeople(body.tab.participants));
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Shared tab could not be loaded.");
    }
  }, [locked, tabId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addParticipant = async () => {
    if (!name.trim() || busy) return;
    if (wallet.trim() && !ADDRESS_RE.test(wallet.trim())) {
      setMessage("Use a complete 0x wallet address, or leave it blank until the participant connects one.");
      return;
    }
    setBusy("add");
    setMessage(null);
    try {
      const response = await fetch(`/api/tabs/${tabId}/participants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name, walletAddress: wallet || null, attachSelf }),
      });
      const body = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok) throw new Error(body.message ?? "Participant was not saved.");
      setName("");
      setWallet("");
      setAttachSelf(false);
      await load();
      setMessage("Participant saved to the shared tab.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Participant was not saved.");
    } finally {
      setBusy(null);
    }
  };

  const createInvite = async (participantId: string) => {
    setBusy(`invite:${participantId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/tabs/${tabId}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId, expiresInHours: 48 }),
      });
      const body = await response.json() as { invite?: { inviteUrl: string; expiresAt: string }; message?: string };
      if (!response.ok || !body.invite) throw new Error(body.message ?? "Invite was not created.");
      setInvite({ participantId, url: body.invite.inviteUrl, expiresAt: body.invite.expiresAt });
      await load();
      setMessage("Invite created. This is the only time the raw link is returned.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invite was not created.");
    } finally {
      setBusy(null);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setMessage("Invite copied. It expires automatically and can be used once.");
    } catch {
      setMessage("Clipboard access was blocked. Select and copy the invite link manually.");
    }
  };

  const recordDecision = async (approvalId: string, status: "rejected" | "revoked") => {
    setBusy(`approval:${approvalId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/tabs/${tabId}/approvals`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalId, status }),
      });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Approval decision was not recorded.");
      await load();
      setMessage(status === "rejected" ? "Pending approval rejected." : "Revocation recorded for collaborators.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval decision was not recorded.");
    } finally {
      setBusy(null);
    }
  };

  if (state === "loading") {
    return <section className="mb-4 rounded-2xl border border-quiet-soft bg-surface-1 p-5" role="status"><span className="inline-flex items-center gap-2 text-sm text-muted"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Loading shared table…</span></section>;
  }
  if (state === "disabled") {
    return <section className="mb-4 rounded-2xl border border-warn/30 bg-warn/5 p-5"><div className="flex gap-3"><CloudOff size={20} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" /><div><h2 className="font-semibold text-txt">Shared tab unavailable</h2><p className="mt-2 text-sm leading-6 text-muted">This URL names a cloud tab, but Supabase is not configured. FINALTab has not loaded or changed any remote participant, invite, or approval.</p></div></div></section>;
  }
  if (state === "signed-out") {
    return <section className="mb-4 rounded-2xl border border-quiet bg-surface-1 p-5"><h2 className="font-semibold text-txt">Sign in to open this shared tab</h2><a href={`/auth?next=${encodeURIComponent(`/app/tab?tab=${tabId}`)}`} className="touch-target mt-3 inline-flex items-center rounded-xl bg-signal px-5 text-sm font-semibold text-ink">Continue to sign in</a></section>;
  }
  if (state === "error" || !tab) {
    return <section className="mb-4 rounded-2xl border border-danger/30 bg-danger/5 p-5" role="alert"><h2 className="font-semibold text-txt">Shared tab not verified</h2><p className="mt-2 text-sm text-muted">{message}</p><button type="button" onClick={() => void load()} className="touch-target mt-3 inline-flex items-center gap-2 text-sm font-semibold text-danger"><RefreshCw size={15} aria-hidden="true" /> Retry</button></section>;
  }

  const canEdit = tab.role === "owner" || tab.role === "member";
  const participantNames = new Map(tab.participants.map((participant) => [participant.id, participant.displayName]));

  return (
    <section className="mb-4 rounded-2xl border border-info/30 bg-surface-1 p-4 sm:p-5" aria-labelledby="cloud-table-title">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-info">Shared cloud tab</p>
          <h2 id="cloud-table-title" className="mt-1 text-xl font-semibold text-txt">{tab.title}</h2>
          <p className="mt-1 text-sm text-muted">{tab.currency} · {tab.role} access · durable across signed-in devices</p>
        </div>
        <span className="inline-flex min-h-8 items-center gap-2 self-start rounded-full border border-verified/30 bg-verified/10 px-3 font-mono text-xs font-semibold uppercase tracking-wide text-verified"><Check size={14} aria-hidden="true" /> synced</span>
      </div>

      <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 rounded-xl border border-quiet-soft bg-canvas/40 p-4">
          <div className="flex items-center gap-2"><Users size={17} className="text-info" aria-hidden="true" /><h3 className="font-semibold text-txt">People and invitations</h3></div>
          <ul className="mt-3 space-y-2">
            {tab.participants.map((participant) => (
              <li key={participant.id} className="rounded-xl border border-quiet-soft bg-surface-2 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="font-medium text-txt">{participant.displayName}</p><p className="mt-1 truncate font-mono text-xs text-muted" title={participant.walletAddress ?? undefined}>{participant.walletAddress ?? "Wallet not attached"}</p><p className="mt-1 text-xs uppercase tracking-wide text-faint">{participant.inviteStatus}{participant.inviteExpiresAt ? ` · expires ${new Date(participant.inviteExpiresAt).toLocaleString()}` : ""}</p></div>
                  {canEdit && !participant.userId ? <button type="button" disabled={busy !== null || locked} onClick={() => void createInvite(participant.id)} className="touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-info/40 px-3 text-sm font-semibold text-info disabled:opacity-50"><Link2 size={15} aria-hidden="true" /> {busy === `invite:${participant.id}` ? "Creating…" : participant.inviteStatus === "invited" ? "Replace invite" : "Invite"}</button> : null}
                </div>
                {invite?.participantId === participant.id ? <div className="mt-3 rounded-lg border border-info/25 bg-info/5 p-3"><label className="text-xs font-medium uppercase tracking-wide text-info" htmlFor={`invite-${participant.id}`}>Single-use invite</label><div className="mt-2 flex gap-2"><input id={`invite-${participant.id}`} readOnly value={invite.url} className="min-h-11 min-w-0 flex-1 rounded-lg border border-quiet bg-canvas px-3 font-mono text-xs text-txt" /><button type="button" onClick={() => void copyInvite()} className="touch-target inline-flex items-center gap-2 rounded-lg border border-info/40 px-3 text-sm text-info"><Clipboard size={15} aria-hidden="true" /> Copy</button></div><p className="mt-2 text-xs text-muted">Expires {new Date(invite.expiresAt).toLocaleString()}. Generating a replacement invalidates this link.</p></div> : null}
              </li>
            ))}
            {tab.participants.length === 0 ? <li className="rounded-xl border border-dashed border-quiet p-4 text-sm text-muted">No participants yet. Add the payer and diners below.</li> : null}
          </ul>

          {canEdit ? <div className="mt-4 border-t border-quiet-soft pt-4"><div className="flex items-center gap-2"><UserPlus size={16} className="text-signal" aria-hidden="true" /><h4 className="font-medium text-txt">Add a participant</h4></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-sm text-muted">Display name<input value={name} onChange={(event) => setName(event.target.value)} disabled={locked} maxLength={64} className="mt-1 min-h-11 w-full rounded-xl border border-quiet bg-surface-2 px-3 text-base text-txt outline-none focus-visible:ring-2 focus-visible:ring-signal" /></label><label className="text-sm text-muted">Wallet, optional<input value={wallet} onChange={(event) => setWallet(event.target.value)} disabled={locked} placeholder="0x…" spellCheck={false} className="mt-1 min-h-11 w-full rounded-xl border border-quiet bg-surface-2 px-3 font-mono text-sm text-txt outline-none focus-visible:ring-2 focus-visible:ring-signal" /></label></div><label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-muted"><input type="checkbox" checked={attachSelf} onChange={(event) => setAttachSelf(event.target.checked)} disabled={locked} className="h-5 w-5 accent-[var(--signal)]" /> This participant is my signed-in account</label><button type="button" onClick={() => void addParticipant()} disabled={locked || busy !== null || !name.trim()} className="touch-target mt-3 rounded-xl bg-signal px-5 text-sm font-semibold text-ink disabled:opacity-50">{busy === "add" ? "Saving…" : "Add to shared tab"}</button><p className="mt-2 text-xs leading-5 text-muted">A listed address is descriptive only. Spending remains impossible until that exact wallet signs the frozen EIP-3009 authorization and payout-plan consent.</p></div> : <p className="mt-4 text-sm text-muted">Viewer access is read-only.</p>}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border border-quiet-soft bg-canvas/40 p-4">
            <div className="flex items-center gap-2"><ShieldAlert size={17} className="text-warn" aria-hidden="true" /><h3 className="font-semibold text-txt">Debtor approvals</h3></div>
            <p className="mt-2 text-sm leading-6 text-muted">This panel reports stored wallet-bound state. It cannot create a “signed” approval; only verified signature ingestion may do that.</p>
            <ul className="mt-3 space-y-2">
              {tab.approvals.map((approval) => {
                const own = approval.userId === tab.currentUserId;
                return <li key={approval.id} className="rounded-xl border border-quiet-soft bg-surface-2 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-txt">{participantNames.get(approval.participantId) ?? "Debtor"}</p><p className="mt-1 font-mono text-xs text-muted">{approval.debitMinor} USDC minor · {approval.walletAddress.slice(0, 8)}…{approval.walletAddress.slice(-6)}</p></div><span className={`rounded-full border px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-wide ${approvalTone(approval.status)}`}>{approval.status}</span></div>{own && approval.status === "pending" ? <button type="button" disabled={busy !== null} onClick={() => void recordDecision(approval.id, "rejected")} className="touch-target mt-2 rounded-lg px-1 text-sm font-semibold text-danger disabled:opacity-50">Reject pending request</button> : null}{own && approval.status === "signed" ? <><button type="button" disabled={busy !== null} onClick={() => void recordDecision(approval.id, "revoked")} className="touch-target mt-2 rounded-lg px-1 text-sm font-semibold text-danger disabled:opacity-50">Record revocation</button><p className="mt-1 text-xs leading-5 text-muted">This records your objection for collaborators. It does not cancel an issued USDC authorization or block submission; do not sign a broadcast approval, and let any existing authorization expire.</p></> : null}</li>;
              })}
              {tab.approvals.length === 0 ? <li className="rounded-xl border border-dashed border-quiet p-4 text-sm text-muted">No frozen-plan approvals yet.</li> : null}
            </ul>
          </div>

          <div className="rounded-xl border border-quiet-soft bg-canvas/40 p-4">
            <h3 className="font-semibold text-txt">Recent audit trail</h3>
            <ol className="mt-3 space-y-2">
              {tab.audit.slice(0, 6).map((event) => <li key={event.id} className="flex min-w-0 flex-col items-start justify-between gap-1 text-sm sm:flex-row sm:gap-3"><span className="min-w-0 text-muted">{event.action.replaceAll(".", " ")}</span><time className="font-mono text-xs text-faint sm:shrink-0" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}
              {tab.audit.length === 0 ? <li className="text-sm text-muted">No committed cloud mutations yet.</li> : null}
            </ol>
          </div>
        </div>
      </div>
      {message ? <p className="mt-4 text-sm text-info" role="status">{message}</p> : null}
    </section>
  );
}
