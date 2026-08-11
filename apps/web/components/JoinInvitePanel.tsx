"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CloudOff, Link2, LogIn, ShieldCheck } from "lucide-react";

interface SessionResponse {
  configured: boolean;
  authenticated: boolean;
  user: { id: string; email: string | null } | null;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export function JoinInvitePanel() {
  const [handoffReady, setHandoffReady] = useState(false);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fragmentToken = url.hash.slice(1);
    window.history.replaceState(null, "", "/join");

    let live = true;
    void (async () => {
      try {
        let handoffResponse: Response;
        if (fragmentToken) {
          if (!TOKEN_RE.test(fragmentToken)) {
            await fetch("/api/invites/handoff", { method: "DELETE" });
            throw new Error("This invite link is incomplete or malformed.");
          }
          handoffResponse = await fetch("/api/invites/handoff", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: fragmentToken }),
          });
        } else {
          handoffResponse = await fetch("/api/invites/handoff", { cache: "no-store" });
        }
        const handoff = await handoffResponse.json() as { available?: boolean; message?: string };
        if (!handoffResponse.ok || !handoff.available) {
          throw new Error(handoff.message ?? "Open the original invite link to continue.");
        }
        if (live) setHandoffReady(true);
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : "The invite handoff could not be secured.");
      }

      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!response.ok) throw new Error("Session check failed");
        const value = await response.json() as SessionResponse;
        if (live) setSession(value);
      } catch {
        if (live) setSession({ configured: false, authenticated: false, user: null });
      }
    })();
    return () => { live = false; };
  }, []);

  const join = async () => {
    if (!handoffReady || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/invites/join", {
        method: "POST",
      });
      const body = await response.json() as { tab?: { id: string; title: string }; message?: string };
      if (!response.ok || !body.tab) throw new Error(body.message ?? "The invite could not be accepted.");
      setJoined(body.tab);
      setHandoffReady(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invite could not be accepted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell min-h-dvh bg-canvas px-4 py-10 text-txt sm:py-16">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="touch-target inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-txt">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-signal text-ink"><Link2 size={18} aria-hidden="true" /></span>
          FINAL<span className="-ml-2 text-signal">Tab</span>
        </Link>

        <section className="surface-shadow mt-8 rounded-3xl border border-quiet-soft bg-surface-1 p-6 sm:p-8" aria-labelledby="join-title">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-info">Private collaboration invite</p>
          <h1 id="join-title" className="display-type mt-4 text-4xl leading-tight sm:text-5xl">Join the table.</h1>
          <p className="mt-4 text-base leading-7 text-muted">Accepting adds your authenticated account to one shared draft. It does not connect a wallet, approve a debit, or move funds.</p>

          {!session ? <p className="mt-6 text-sm text-muted" role="status">Checking cloud session…</p> : null}

          {session && !session.configured ? (
            <div className="mt-6 rounded-2xl border border-warn/30 bg-warn/5 p-5">
              <div className="flex gap-3"><CloudOff size={20} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" /><div><h2 className="font-semibold text-txt">Cloud collaboration is disabled</h2><p className="mt-2 text-sm leading-6 text-muted">Supabase credentials are not provisioned in this deployment. The invite was not looked up or accepted.</p></div></div>
            </div>
          ) : null}

          {session?.configured && !session.authenticated && handoffReady ? (
            <div className="mt-6 rounded-2xl border border-quiet bg-surface-2 p-5">
              <div className="flex gap-3"><LogIn size={20} className="mt-0.5 shrink-0 text-info" aria-hidden="true" /><div><h2 className="font-semibold text-txt">Sign in before joining</h2><p className="mt-2 text-sm leading-6 text-muted">The invite remains unclaimed. After passwordless sign-in, FINALTab will ask for confirmation again.</p></div></div>
              <Link href="/auth?next=%2Fjoin" className="touch-target mt-4 inline-flex items-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-ink">Continue to sign in <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          ) : null}

          {session?.authenticated && handoffReady && !joined ? (
            <div className="mt-6 rounded-2xl border border-info/30 bg-info/5 p-5">
              <div className="flex gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-info" aria-hidden="true" /><div><h2 className="font-semibold text-txt">Ready to claim this invite</h2><p className="mt-2 text-sm leading-6 text-muted">Signed in as {session.user?.email ?? "your cloud account"}. The token is single-use and will be removed after acceptance.</p></div></div>
              <button type="button" onClick={() => void join()} disabled={busy} className="touch-target mt-4 inline-flex items-center gap-2 rounded-xl bg-info px-5 text-sm font-semibold text-ink disabled:opacity-50">{busy ? "Joining…" : "Join shared tab"} <ArrowRight size={16} aria-hidden="true" /></button>
            </div>
          ) : null}

          {joined ? (
            <div className="mt-6 rounded-2xl border border-verified/30 bg-verified/5 p-5" role="status">
              <h2 className="font-semibold text-verified">Invite accepted</h2>
              <p className="mt-2 text-sm text-muted">You are now a member of “{joined.title}”. Wallet approval remains a separate signed step.</p>
              <Link href={`/app/tab?tab=${encodeURIComponent(joined.id)}`} className="touch-target mt-4 inline-flex items-center gap-2 rounded-xl bg-verified px-5 text-sm font-semibold text-ink">Open shared table <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          ) : null}

          {error ? <p className="mt-5 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger" role="alert">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
