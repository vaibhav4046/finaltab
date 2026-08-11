"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null | undefined;

/** One cookie-backed PKCE client per browser runtime. */
export function createBrowserSupabaseClient() {
  if (browserClient !== undefined) return browserClient;
  const config = supabasePublicConfig();
  browserClient = config
    ? createBrowserClient(config.url, config.publishableKey, {
        auth: {
          // Correlate every callback to its per-flow verifier so overlapping
          // sign-ins cannot consume each other's single-use PKCE code.
          experimental: { appendPkceFlowIdToRedirects: true },
        },
        cookieOptions: { sameSite: "lax", secure: location.protocol === "https:" },
      })
    : null;
  return browserClient;
}
