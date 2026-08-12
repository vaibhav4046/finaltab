"use client";

import { useEffect, useState } from "react";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { usePrivyBridgeState } from "./PrivyBridgeContext";

interface VerifiedSession {
  privyUserId: string;
  supabaseUserId: string;
  sessionId: string;
  expiresAt: number;
  walletAddresses: string[];
}

type CheckState =
  | { status: "idle" | "checking" }
  | { status: "verified"; identity: VerifiedSession }
  | { status: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  PRIVY_NOT_CONFIGURED: "Privy server verification is not configured.",
  SUPABASE_NOT_CONFIGURED: "The durable Supabase identity layer is not configured.",
  SUPABASE_SESSION_REQUIRED: "Your Supabase session expired. Request a new sign-in link.",
  TOKEN_MISSING: "Privy identity tokens are not available. Enable identity tokens in Privy.",
  TOKEN_MALFORMED: "Privy returned a malformed session token.",
  TOKEN_AMBIGUOUS: "Conflicting Privy tokens were rejected.",
  TOKEN_INVALID: "Privy could not verify this session. Sign in again.",
  TOKEN_PAIR_MISMATCH: "The Privy access and identity tokens belong to different users.",
  IDENTITY_BRIDGE_MISMATCH: "Privy is not linked to this Supabase account.",
  ORIGIN_REJECTED: "The session check was rejected because its origin did not match.",
};

function shortId(value: string): string {
  return value.length <= 24 ? value : `${value.slice(0, 14)}…${value.slice(-6)}`;
}

export function ConfiguredPrivySessionPanel() {
  const bridge = usePrivyBridgeState();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [check, setCheck] = useState<CheckState>({ status: "idle" });

  useEffect(() => {
    if (
      !ready ||
      !authenticated ||
      !bridge.supabaseAuthenticated ||
      bridge.syncStatus !== "done" ||
      !identityToken
    ) {
      setCheck({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setCheck({ status: "checking" });
    void getAccessToken()
      .then(async (accessToken) => {
        if (!accessToken) throw new Error("TOKEN_MISSING");
        const response = await fetch("/api/privy/session", {
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "privy-id-token": identityToken,
          },
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          error?: string;
          identity?: VerifiedSession;
        };
        if (!response.ok || !body.identity) {
          throw new Error(body.error ?? "TOKEN_INVALID");
        }
        return body.identity;
      })
      .then((identity) => {
        if (!controller.signal.aborted) setCheck({ status: "verified", identity });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const code = cause instanceof Error ? cause.message : "TOKEN_INVALID";
        setCheck({
          status: "error",
          message: ERROR_MESSAGES[code] ?? "Privy session verification failed.",
        });
      });
    return () => controller.abort();
  }, [authenticated, bridge.supabaseAuthenticated, bridge.syncStatus, getAccessToken, identityToken, ready]);

  let detail = "Waiting for the Supabase session before linking Privy.";
  let tone = "text-fog";
  if (!bridge.supabaseConfigured) {
    detail = "Supabase must be configured before Privy can trust its JWTs.";
    tone = "text-warn";
  } else if (bridge.syncStatus === "not-enabled") {
    detail = "Privy custom JWT authentication is not enabled for this app.";
    tone = "text-warn";
  } else if (bridge.syncStatus === "error" || bridge.syncError) {
    detail = bridge.syncError ?? "Privy identity synchronization failed.";
    tone = "text-danger";
  } else if (bridge.syncStatus === "loading" || !ready || check.status === "checking") {
    detail = "Verifying issuer, audience, token pair and Supabase subject…";
  } else if (bridge.supabaseAuthenticated && !authenticated) {
    detail = "Supabase is signed in; Privy is still establishing the linked session.";
  } else if (authenticated && !identityToken) {
    detail = "Enable Privy identity tokens to prove the Supabase-to-Privy link on the server.";
    tone = "text-warn";
  } else if (check.status === "error") {
    detail = check.message;
    tone = "text-danger";
  } else if (check.status === "verified") {
    detail = "Identity and wallet provisioning verified. V2 settlement signatures still require an external wallet.";
    tone = "text-signal";
  }

  return (
    <section className="rounded-xl border border-edge bg-panel-2 p-4" aria-labelledby="privy-session-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-fog-dim">Identity bridge</p>
          <h3 id="privy-session-title" className="mt-1 text-sm font-semibold text-paper">
            Supabase RLS + Privy provisioned identity
          </h3>
        </div>
        <span className={`font-mono text-xs uppercase tracking-wider ${tone}`}>
          {check.status === "verified" ? "verified" : "fail-closed"}
        </span>
      </div>
      <p className={`mt-2 text-sm leading-relaxed ${tone}`} role="status" aria-live="polite">
        {detail}
      </p>
      {check.status === "verified" ? (
        <div className="mt-3 grid gap-2 border-t border-edge-soft pt-3 font-mono text-xs text-fog sm:grid-cols-2">
          <p>Privy · {shortId(check.identity.privyUserId)}</p>
          <p>Supabase · {shortId(check.identity.supabaseUserId)}</p>
          <p className="sm:col-span-2">
            Provisioned wallet · {check.identity.walletAddresses[0] ?? "provisioning pending"}
          </p>
        </div>
      ) : null}
    </section>
  );
}
