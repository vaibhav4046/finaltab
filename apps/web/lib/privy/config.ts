export interface PrivyPublicConfig {
  appId: string;
  clientId?: string;
  apiUrl?: string;
}

type PublicPrivyEnvironment = Readonly<Record<string, string | undefined>>;

const OPAQUE_ID = /^[A-Za-z0-9_-]{6,200}$/;

function optionalOpaqueId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && OPAQUE_ID.test(normalized) ? normalized : undefined;
}

function optionalHttpsOrigin(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined;
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

/**
 * Public Privy identifiers are safe to expose, but malformed or missing values
 * disable the integration. A placeholder must never become an active app ID.
 */
export function privyPublicConfig(
  env: PublicPrivyEnvironment = process.env,
): PrivyPublicConfig | null {
  const appId = optionalOpaqueId(env.NEXT_PUBLIC_PRIVY_APP_ID);
  if (!appId) return null;

  const clientId = optionalOpaqueId(env.NEXT_PUBLIC_PRIVY_CLIENT_ID);
  const apiUrl = optionalHttpsOrigin(env.NEXT_PUBLIC_PRIVY_API_URL);
  return {
    appId,
    ...(clientId ? { clientId } : {}),
    ...(apiUrl ? { apiUrl } : {}),
  };
}

export function isPrivyPublicConfigured(): boolean {
  return privyPublicConfig() !== null;
}

export const privyConfigInternals = {
  optionalOpaqueId,
  optionalHttpsOrigin,
};
