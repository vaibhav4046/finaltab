"use client";

import { lazy, Suspense, type ReactNode } from "react";
import {
  DISABLED_PRIVY_BRIDGE,
  PrivyBridgeContext,
} from "./PrivyBridgeContext";

const ConfiguredPrivyAuthProvider = lazy(async () => {
  const runtime = await import("./PrivyAuthProviderRuntime");
  return { default: runtime.ConfiguredPrivyAuthProvider };
});

export interface FinalTabPrivyProviderProps {
  children: ReactNode;
  appId?: string;
  clientId?: string;
  apiUrl?: string;
}

/**
 * Keep the unconfigured application fast and honest: the large wallet SDK is
 * loaded only when a real Privy app ID is present. No mock provider is mounted.
 */
export function FinalTabPrivyProvider({
  children,
  appId,
  clientId,
  apiUrl,
}: FinalTabPrivyProviderProps) {
  if (!appId) {
    return (
      <PrivyBridgeContext.Provider value={DISABLED_PRIVY_BRIDGE}>
        {children}
      </PrivyBridgeContext.Provider>
    );
  }

  return (
    <Suspense
      fallback={(
        <PrivyBridgeContext.Provider value={{
          ...DISABLED_PRIVY_BRIDGE,
          providerConfigured: true,
          syncStatus: "initial",
        }}>
          {children}
        </PrivyBridgeContext.Provider>
      )}
    >
      <ConfiguredPrivyAuthProvider appId={appId} clientId={clientId} apiUrl={apiUrl}>
        {children}
      </ConfiguredPrivyAuthProvider>
    </Suspense>
  );
}
