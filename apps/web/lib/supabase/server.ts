import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "./config";

/**
 * Create a request-scoped client. Never hoist this client into module state:
 * Vercel Fluid Compute may reuse a warm instance across different users.
 */
export async function createServerSupabaseClient() {
  const config = supabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot mutate cookies. middleware.ts refreshes
          // the session before protected rendering, so this is safe there.
        }
      },
    },
  });
}

export async function authenticatedUser() {
  const client = await createServerSupabaseClient();
  if (!client) return { configured: false as const, client: null, user: null };
  const { data, error } = await client.auth.getUser();
  return {
    configured: true as const,
    client,
    user: error ? null : data.user,
  };
}
