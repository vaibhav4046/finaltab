"use client";

import { lazy, Suspense } from "react";
import { usePrivyBridgeState } from "./PrivyBridgeContext";

const ConfiguredPrivySessionPanel = lazy(async () => {
  const runtime = await import("./PrivySessionPanelRuntime");
  return { default: runtime.ConfiguredPrivySessionPanel };
});

function LoadingPrivySessionPanel() {
  return (
    <section
      className="rounded-xl border border-edge bg-panel-2 p-4"
      aria-labelledby="privy-session-loading-title"
      aria-busy="true"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog-dim">Identity bridge</p>
      <h3 id="privy-session-loading-title" className="mt-1 text-sm font-semibold text-paper">
        Loading configured identity provider
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-fog" role="status">
        Loading the Privy wallet runtime only for this configured route…
      </p>
    </section>
  );
}

export function PrivySessionPanel() {
  const bridge = usePrivyBridgeState();
  if (!bridge.providerConfigured) {
    return (
      <section className="rounded-xl border border-warn/30 bg-warn/5 p-4" aria-labelledby="privy-session-title">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-warn">Privy setup required</p>
        <h3 id="privy-session-title" className="mt-1 text-sm font-semibold text-paper">Identity bridge is off</h3>
        <p className="mt-2 text-sm leading-relaxed text-fog">
          No Privy app ID is present. Identity/wallet provisioning and Privy-only routes remain unavailable.
        </p>
      </section>
    );
  }

  return (
    <Suspense fallback={<LoadingPrivySessionPanel />}>
      <ConfiguredPrivySessionPanel />
    </Suspense>
  );
}
