"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";

let browserClient: SupabaseClient | null | undefined;
let loading: Promise<SupabaseClient | null> | null = null;

/**
 * One cookie-backed PKCE client per browser runtime.
 *
 * The SDK is imported when a caller first needs it, not at module scope. Every
 * caller reaches this from a click handler or a mount effect, so a static
 * import only had the effect of putting the whole browser client — including
 * the realtime transport this application never opens — into the first load of
 * every page that renders a sign-in form. A `null` result still means "this
 * deployment has no public Supabase configuration", exactly as before.
 */
export function loadBrowserSupabaseClient(): Promise<SupabaseClient | null> {
  if (browserClient !== undefined) return Promise.resolve(browserClient);
  // Concurrent callers share one import and one client. Two clients would mean
  // two PKCE verifier stores racing over the same cookie.
  if (loading) return loading;

  loading = (async () => {
    const config = supabasePublicConfig();
    if (!config) return null;
    const { createBrowserClient } = await import("@supabase/ssr");
    return createBrowserClient(config.url, config.publishableKey, {
      auth: {
        // Correlate every callback to its per-flow verifier so overlapping
        // sign-ins cannot consume each other's single-use PKCE code.
        experimental: { appendPkceFlowIdToRedirects: true },
      },
      cookieOptions: { sameSite: "lax", secure: location.protocol === "https:" },
    });
  })();

  return loading
    .then((client) => {
      browserClient = client;
      return client;
    })
    .finally(() => {
      // Cleared either way: a failed import must be retryable rather than
      // permanently resolving to a client that was never created.
      loading = null;
    });
}
