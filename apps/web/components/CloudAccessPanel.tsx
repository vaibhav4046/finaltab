"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  connectWallet,
  hasInjectedWallet,
  signMessage,
  switchToBaseSepolia,
} from "@/lib/wallet";

interface SessionState {
  configured: boolean;
  authenticated: boolean;
  user: { id: string; email: string | null } | null;
}

interface Challenge {
  challengeId: string;
  message: string;
  address: `0x${string}`;
}

function requestedNextPath(): string {
  const value = new URLSearchParams(window.location.search).get("next");
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export function CloudAccessPanel() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState<`0x${string}` | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [busy, setBusy] = useState<"email" | "wallet" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWalletAvailable(hasInjectedWallet());
    let live = true;
    void fetch("/api/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not read session");
        return (await response.json()) as SessionState;
      })
      .then((value) => {
        if (live) setSession(value);
      })
      .catch(() => {
        if (live) setSession({ configured: false, authenticated: false, user: null });
      });
    return () => {
      live = false;
    };
  }, []);

  const sendMagicLink = async () => {
    const client = createBrowserSupabaseClient();
    if (!client || !email.trim()) return;
    setBusy("email");
    setError(null);
    setNotice(null);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", requestedNextPath());
    const { error: authError } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
    });
    setBusy(null);
    if (authError) setError(authError.message);
    else setNotice("Check your email for a secure sign-in link.");
  };

  const verifyWallet = async () => {
    setBusy("wallet");
    setError(null);
    setNotice(null);
    try {
      const account = await connectWallet();
      if (!account) throw new Error("No injected wallet account was approved.");
      if (!(await switchToBaseSepolia())) throw new Error("Switch to Base Sepolia to continue.");

      const challengeResponse = await fetch("/api/wallet/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: account.address }),
      });
      const challengeBody = (await challengeResponse.json()) as Challenge & {
        error?: string;
        message?: string;
      };
      if (!challengeResponse.ok) {
        throw new Error(challengeBody.message ?? challengeBody.error ?? "Could not create wallet challenge.");
      }

      const signature = await signMessage(account.address, challengeBody.message);
      if (!signature) throw new Error("Wallet ownership signature was cancelled.");
      const verifyResponse = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: challengeBody.challengeId, signature }),
      });
      const verified = (await verifyResponse.json()) as { address?: `0x${string}`; error?: string };
      if (!verifyResponse.ok || !verified.address) {
        throw new Error(verified.error ?? "Wallet verification failed.");
      }
      setWallet(verified.address);
      setNotice("Wallet ownership verified. No transaction was sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet verification failed.");
    } finally {
      setBusy(null);
    }
  };

  if (!session) {
    return <p className="font-mono text-xs text-fog" role="status">Checking secure session…</p>;
  }

  if (!session.configured) {
    return (
      <section className="rounded-xl border border-warn/30 bg-warn/5 p-4" aria-labelledby="cloud-title">
        <p id="cloud-title" className="font-mono text-xs font-semibold uppercase tracking-wider text-warn">
          Cloud account setup pending
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fog">
          This build is running in local preview mode because Supabase credentials are not provisioned.
          Wallet verification, invitations, cross-device tabs, and durable proof history stay disabled—never faked.
        </p>
      </section>
    );
  }

  if (!session.authenticated) {
    return (
      <section className="rounded-xl border border-edge bg-panel p-5" aria-labelledby="cloud-title">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">Secure account</p>
        <h2 id="cloud-title" className="mt-2 text-lg font-semibold text-paper">Resume any tab, on any device</h2>
        <p className="mt-1 text-sm text-fog">We send a passwordless sign-in link. Your wallet remains separate until you verify it.</p>
        <label htmlFor="cloud-email" className="mt-4 block text-sm font-medium text-paper">Email address</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="cloud-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-11 flex-1 rounded-lg border border-edge bg-panel-2 px-3 text-base text-paper outline-none focus-visible:ring-2 focus-visible:ring-signal"
            placeholder="you@example.com"
          />
          <button
            type="button"
            onClick={() => void sendMagicLink()}
            disabled={busy !== null || !email.trim()}
            className="min-h-11 rounded-lg bg-signal px-5 font-mono text-xs font-semibold uppercase tracking-wider text-ink disabled:opacity-50"
          >
            {busy === "email" ? "Sending…" : "Email sign-in link"}
          </button>
        </div>
        {notice ? <p className="mt-3 text-sm text-signal" role="status">{notice}</p> : null}
        {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-edge bg-panel p-5" aria-labelledby="cloud-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">Cloud account active</p>
          <h2 id="cloud-title" className="mt-2 text-lg font-semibold text-paper">
            {session.user?.email ?? "Signed in"}
          </h2>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="min-h-11 rounded-lg border border-edge px-4 text-sm text-fog hover:text-paper">
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-5 rounded-lg border border-edge-soft bg-panel-2 p-4">
        <p className="text-sm font-medium text-paper">Verified settlement wallet</p>
        {wallet ? (
          <p className="mt-2 break-all font-mono text-xs text-signal" role="status">{wallet}</p>
        ) : (
          <p className="mt-1 text-sm text-fog">
            Connect an injected wallet and sign a one-time ownership message. This step never moves funds.
          </p>
        )}
        <button
          type="button"
          onClick={() => void verifyWallet()}
          disabled={busy !== null || !walletAvailable}
          className="mt-3 min-h-11 rounded-lg border border-signal/50 px-4 font-mono text-xs font-semibold uppercase tracking-wider text-signal disabled:opacity-50"
        >
          {busy === "wallet" ? "Verifying…" : wallet ? "Verify another wallet" : "Connect & verify wallet"}
        </button>
        {!walletAvailable ? (
          <p className="mt-2 text-xs text-warn">No injected wallet detected. Install MetaMask or use a compatible browser wallet.</p>
        ) : null}
      </div>
      {notice ? <p className="mt-3 text-sm text-signal" role="status">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
    </section>
  );
}
