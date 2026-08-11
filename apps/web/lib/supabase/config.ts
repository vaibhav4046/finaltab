export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

/**
 * Supabase is an optional deployment capability while the repository remains
 * runnable for judges without credentials. When absent, callers must present
 * an honest setup state; they must never invent a cloud session.
 */
export function supabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return supabasePublicConfig() !== null;
}
