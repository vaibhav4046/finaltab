import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";

/**
 * Server-only client for operations users must not be able to self-assert,
 * such as marking a wallet signature as verified. The secret key is never a
 * NEXT_PUBLIC variable and this client is never imported by Client Components.
 */
export function createAdminSupabaseClient() {
  const config = supabasePublicConfig();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !secret) return null;

  return createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
