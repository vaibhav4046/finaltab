"use client";

import { createContext, useContext } from "react";

export type PrivySyncStatus =
  | "disabled"
  | "initial"
  | "loading"
  | "not-enabled"
  | "done"
  | "error";

export interface PrivyBridgeState {
  providerConfigured: boolean;
  supabaseConfigured: boolean;
  supabaseAuthenticated: boolean;
  syncStatus: PrivySyncStatus;
  syncError: string | null;
}

export const DISABLED_PRIVY_BRIDGE: PrivyBridgeState = {
  providerConfigured: false,
  supabaseConfigured: false,
  supabaseAuthenticated: false,
  syncStatus: "disabled",
  syncError: null,
};

export const PrivyBridgeContext = createContext<PrivyBridgeState>(DISABLED_PRIVY_BRIDGE);

export function usePrivyBridgeState(): PrivyBridgeState {
  return useContext(PrivyBridgeContext);
}
