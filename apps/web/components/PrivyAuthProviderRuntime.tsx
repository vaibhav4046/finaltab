"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PrivyProvider, useSubscribeToJwtAuthWithFlag } from "@privy-io/react-auth";
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import type { Chain } from "viem";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  PrivyBridgeContext,
  type PrivyBridgeState,
} from "./PrivyBridgeContext";

// Avoid importing viem's every-chain barrel into the account bundle. This is
// the stable Base Sepolia chain record used by the settlement rail.
const baseSepolia: Chain = {
  id: 84_532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  blockExplorers: {
    default: {
      name: "Basescan",
      url: "https://sepolia.basescan.org",
      apiUrl: "https://api-sepolia.basescan.org/api",
    },
  },
  sourceId: 11_155_111,
  testnet: true,
};

function BridgeRuntime({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    setSupabase(createBrowserSupabaseClient());
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setAuthenticated(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({
      data,
      error,
    }: {
      data: { session: Session | null };
      error: Error | null;
    }) => {
      if (!active) return;
      setAuthenticated(!error && Boolean(data.session));
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((
      _event: AuthChangeEvent,
      session: Session | null,
    ) => {
      if (!active) return;
      setAuthenticated(Boolean(session));
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const getExternalJwt = useCallback(async (): Promise<string | undefined> => {
    if (!supabase) return undefined;
    const { data, error } = await supabase.auth.getSession();
    if (error) return undefined;
    return data.session?.access_token;
  }, [supabase]);

  const { state } = useSubscribeToJwtAuthWithFlag({
    enabled: Boolean(supabase),
    isAuthenticated: authenticated,
    isLoading: loading,
    getExternalJwt,
    onAuthenticated: () => setSyncError(null),
    onUnauthenticated: () => setSyncError(null),
    onError: () => setSyncError("Privy could not verify the Supabase identity token."),
  });

  const value = useMemo<PrivyBridgeState>(
    () => ({
      providerConfigured: true,
      supabaseConfigured: Boolean(supabase),
      supabaseAuthenticated: authenticated,
      syncStatus: state.status,
      syncError,
    }),
    [authenticated, state.status, supabase, syncError],
  );

  return <PrivyBridgeContext.Provider value={value}>{children}</PrivyBridgeContext.Provider>;
}

export interface ConfiguredPrivyAuthProviderProps {
  children: ReactNode;
  appId: string;
  clientId?: string;
  apiUrl?: string;
}

/** Supabase stays the login/RLS authority; Privy subscribes to its signed JWT. */
export function ConfiguredPrivyAuthProvider({
  children,
  appId,
  clientId,
  apiUrl,
}: ConfiguredPrivyAuthProviderProps) {
  return (
    <PrivyProvider
      appId={appId}
      {...(clientId ? { clientId } : {})}
      {...(apiUrl ? { apiUrl } : {})}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#b7ff3c",
          showWalletLoginFirst: false,
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <BridgeRuntime>{children}</BridgeRuntime>
    </PrivyProvider>
  );
}
