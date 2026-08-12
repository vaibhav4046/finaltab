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
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-fog-dim">Identity bridge</p>
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
  if (!bridge.providerConfigured) return null;

  return (
    <Suspense fallback={<LoadingPrivySessionPanel />}>
      <ConfiguredPrivySessionPanel />
    </Suspense>
  );
}
