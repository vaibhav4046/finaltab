"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeNextPath } from "@/lib/auth/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  connectWallet,
  hasInjectedWallet,
  signMessage,
  switchToBaseSepolia,
} from "@/lib/wallet";
import { PrivySessionPanel } from "./PrivySessionPanel";

export type AuthMode = "sign-in" | "create-account";

interface SessionState {
  configured: boolean;
  authenticated: boolean;
  walletLinkConfigured: boolean;
  user: { id: string; email: string | null } | null;
}

interface Challenge {
  challengeId: string;
  message: string;
  address: `0x${string}`;
}

const QUERY_ERRORS: Record<string, string> = {
  "cloud-not-configured": "Account sign-in is unavailable until Supabase is configured.",
  "missing-or-ambiguous-code": "That email return did not contain one valid sign-in code.",
  "invalid-or-expired-link": "That secure email link is invalid or expired. Request a new one.",
  "session-required": "Your account session expired. Sign in again to continue.",
};

function requestedNextPath(): string {
  if (typeof window === "undefined") return "/app";
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

function modeHref(mode: AuthMode, next: string): string {
  const path = mode === "sign-in" ? "/auth/sign-in" : "/auth/create-account";
  return next === "/app" ? path : `${path}?next=${encodeURIComponent(next)}`;
}

export function CloudAccessPanel({ initialMode = "sign-in" }: { initialMode?: AuthMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionLoadError, setSessionLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [wallet, setWallet] = useState<`0x${string}` | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [busy, setBusy] = useState<"email" | "otp" | "wallet" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = typeof window === "undefined" ? "/app" : requestedNextPath();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const errorCode = query.get("error");
    if (errorCode) setError(QUERY_ERRORS[errorCode] ?? "Account authentication could not be completed.");
    if (query.get("status") === "signed-out") setNotice("You are securely signed out on this device.");
  }, []);

  useEffect(() => {
    setWalletAvailable(hasInjectedWallet());
    const controller = new AbortController();
    void fetch("/api/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not read session");
        return (await response.json()) as SessionState;
      })
      .then((value) => {
        setSession(value);
        setSessionLoadError(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setSessionLoadError(true);
      });
    return () => controller.abort();
  }, []);

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setOtpRequested(false);
    setOtp("");
    setNotice(null);
    setError(null);
    router.replace(modeHref(nextMode, requestedNextPath()), { scroll: false });
  };

  const sendEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const client = createBrowserSupabaseClient();
    const normalizedEmail = email.trim().toLowerCase();
    if (!client || !normalizedEmail) return;

    setBusy("email");
    setError(null);
    setNotice(null);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", requestedNextPath());
    const { error: authError } = await client.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: callback.toString(),
        shouldCreateUser: mode === "create-account",
      },
    });
    setBusy(null);

    if (authError) {
      setError(
        mode === "sign-in"
          ? "We could not send a sign-in email. Check the address or create an account."
          : "We could not create this account. Check the address and try again shortly.",
      );
      return;
    }
    setOtpRequested(true);
    setNotice(
      "Check your email. Open the secure link, or enter the one-time code if your email contains one.",
    );
  };

  const verifyEmailCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const client = createBrowserSupabaseClient();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.replaceAll(/\s/g, "");
    if (!client || !normalizedEmail || !/^\d{6,8}$/.test(normalizedOtp)) return;

    setBusy("otp");
    setError(null);
    const { error: authError } = await client.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedOtp,
      type: "email",
    });
    setBusy(null);
    if (authError) {
      setError("That one-time code is invalid or expired. Request a new email.");
      return;
    }
    window.location.assign(`/auth/complete?next=${encodeURIComponent(requestedNextPath())}`);
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
      setNotice("External wallet ownership verified. No transaction was sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet verification failed.");
    } finally {
      setBusy(null);
    }
  };

  if (sessionLoadError) {
    return (
      <section className="rounded-xl border border-danger/30 bg-danger/5 p-5" aria-labelledby="account-title">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-danger">Account check failed</p>
        <h2 id="account-title" className="mt-2 text-xl font-semibold text-paper">We could not read this session.</h2>
        <p className="mt-2 text-sm text-fog">Reload this page before entering an email. No account state was assumed.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-11 rounded-lg border border-edge px-4 text-sm text-paper">
          Reload securely
        </button>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="rounded-xl border border-edge bg-panel p-5" aria-busy="true" aria-live="polite">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-fog">Checking encrypted account session...</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-edge">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-signal" />
        </div>
      </section>
    );
  }

  if (!session.configured) {
    return (
      <div className="grid gap-4">
        <section className="rounded-xl border border-warn/30 bg-warn/5 p-5" aria-labelledby="account-title">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-warn">Account setup required</p>
          <h2 id="account-title" className="mt-2 text-xl font-semibold text-paper">Sign-in is fail-closed.</h2>
          <p className="mt-2 text-sm leading-relaxed text-fog">
            This deployment has no Supabase public project configuration. Account creation, sign-in,
            durable tabs, invitations and wallet linking remain unavailable; no browser-only identity is substituted.
          </p>
        </section>
        <PrivySessionPanel />
      </div>
    );
  }

  if (!session.authenticated) {
    return (
      <section className="overflow-hidden rounded-xl border border-edge bg-panel" aria-labelledby="account-title">
        <div className="border-b border-edge bg-panel-2/60 p-2">
          <div className="grid grid-cols-2 gap-2" aria-label="Account action">
            {(["sign-in", "create-account"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => selectMode(candidate)}
                aria-pressed={mode === candidate}
                className={`min-h-11 rounded-lg px-4 font-mono text-xs font-semibold uppercase tracking-wider transition ${
                  mode === candidate
                    ? "bg-signal text-ink"
                    : "text-fog hover:bg-edge-soft hover:text-paper"
                }`}
              >
                {candidate === "sign-in" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 md:p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">FINALTab account</p>
          <h2 id="account-title" className="mt-2 text-2xl font-semibold tracking-tight text-paper">
            {mode === "sign-in" ? "Return to your tabs." : "Create your secure account."}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fog">
            Supabase verifies your email and remains the database/RLS identity. After that succeeds,
            Privy can provision a wallet identity for the exact same UUID. Current V2 settlement signing still uses an external wallet.
          </p>

          <form onSubmit={(event) => void sendEmail(event)} className="mt-5">
            <label htmlFor="account-email" className="block text-sm font-medium text-paper">Email address</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="account-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-12 flex-1 rounded-lg border border-edge bg-panel-2 px-3 text-base text-paper outline-none focus-visible:ring-2 focus-visible:ring-signal"
                placeholder="you@example.com"
              />
              <button
                type="submit"
                disabled={busy !== null || !email.trim()}
                className="min-h-12 rounded-lg bg-signal px-5 font-mono text-xs font-semibold uppercase tracking-wider text-ink disabled:opacity-50"
              >
                {busy === "email"
                  ? "Sending..."
                  : mode === "sign-in"
                    ? "Send sign-in email"
                    : "Create with email"}
              </button>
            </div>
          </form>

          {otpRequested ? (
            <form onSubmit={(event) => void verifyEmailCode(event)} className="mt-4 rounded-lg border border-edge-soft bg-panel-2 p-4">
              <label htmlFor="account-otp" className="block text-sm font-medium text-paper">One-time email code</label>
              <p className="mt-1 text-xs text-fog">Only use this field when your FINALTab email includes a numeric code.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  id="account-otp"
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6,8}"
                  minLength={6}
                  maxLength={8}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                  className="min-h-11 flex-1 rounded-lg border border-edge bg-canvas px-3 font-mono text-base tracking-[0.25em] text-paper outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  placeholder="000000"
                />
                <button
                  type="submit"
                  disabled={busy !== null || !/^\d{6,8}$/.test(otp)}
                  className="min-h-11 rounded-lg border border-signal/60 px-5 font-mono text-xs font-semibold uppercase tracking-wider text-signal disabled:opacity-50"
                >
                  {busy === "otp" ? "Verifying..." : "Verify code"}
                </button>
              </div>
            </form>
          ) : null}

          {notice ? <p className="mt-4 text-sm text-signal" role="status">{notice}</p> : null}
          {error ? <p className="mt-4 text-sm text-danger" role="alert">{error}</p> : null}
          <p className="mt-5 text-xs leading-relaxed text-fog-dim">
            Links and codes are single-use. FINALTab never asks for a password, wallet seed phrase or Privy app secret.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-edge bg-panel p-5" aria-labelledby="account-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">Account active</p>
            <h2 id="account-title" className="mt-2 text-xl font-semibold text-paper">
              {session.user?.email ?? "Verified Supabase user"}
            </h2>
            <p className="mt-1 break-all font-mono text-[10px] text-fog-dim">RLS subject {session.user?.id}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button type="submit" className="min-h-11 rounded-lg border border-edge px-4 text-sm text-fog hover:text-paper">
              Sign out
            </button>
          </form>
        </div>
        <div className="mt-5">
          <PrivySessionPanel />
        </div>
        <Link href={next} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-signal px-5 font-mono text-xs font-semibold uppercase tracking-wider text-ink">
          Continue to FINALTab
        </Link>
      </section>

      <section className="rounded-xl border border-edge bg-panel p-5" aria-labelledby="external-wallet-title">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog-dim">Optional external wallet</p>
        <h3 id="external-wallet-title" className="mt-1 text-sm font-semibold text-paper">Prove an injected Base Sepolia wallet</h3>
        {wallet ? (
          <p className="mt-2 break-all font-mono text-xs text-signal" role="status">{wallet}</p>
        ) : (
          <p className="mt-2 text-sm text-fog">Sign one challenge to prove ownership. This does not move funds or change Supabase permissions.</p>
        )}
        <button
          type="button"
          onClick={() => void verifyWallet()}
          disabled={busy !== null || !walletAvailable || !session.walletLinkConfigured}
          className="mt-3 min-h-11 rounded-lg border border-signal/50 px-4 font-mono text-xs font-semibold uppercase tracking-wider text-signal disabled:opacity-50"
        >
          {busy === "wallet" ? "Verifying..." : wallet ? "Verify another wallet" : "Connect and verify"}
        </button>
        {!session.walletLinkConfigured ? (
          <p className="mt-2 text-xs text-warn">Wallet ownership linking is not enabled on this deployment.</p>
        ) : !walletAvailable ? (
          <p className="mt-2 text-xs text-warn">No compatible injected wallet was detected.</p>
        ) : null}
      </section>
      {notice ? <p className="text-sm text-signal" role="status">{notice}</p> : null}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
