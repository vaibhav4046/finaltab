import "server-only";

import {
  verifyAccessToken,
  verifyIdentityToken,
  type User as PrivyUser,
  type VerifyAccessTokenResponse,
} from "@privy-io/node";
import { canonicalAppOrigin } from "@/lib/auth/navigation";
import { privyPublicConfig, type PrivyPublicConfig } from "./config";

const MAX_TOKEN_LENGTH = 16_384;
const PRIVY_ISSUER = "privy.io";

export interface PrivyServerConfig extends PrivyPublicConfig {
  verificationKey: string;
}

type ServerPrivyEnvironment = Readonly<Record<string, string | undefined>>;

function normalizeVerificationKey(value: string | undefined): string | null {
  const normalized = value?.trim().replaceAll("\\n", "\n");
  if (!normalized || normalized.length > 16_384) return null;
  if (
    !normalized.startsWith("-----BEGIN PUBLIC KEY-----\n") ||
    !normalized.endsWith("\n-----END PUBLIC KEY-----")
  ) {
    return null;
  }
  return normalized;
}

export function privyServerConfig(
  env: ServerPrivyEnvironment = process.env,
): PrivyServerConfig | null {
  const publicConfig = privyPublicConfig(env);
  const verificationKey = normalizeVerificationKey(env.PRIVY_VERIFICATION_KEY);
  if (!publicConfig || !verificationKey) return null;
  return { ...publicConfig, verificationKey };
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function boundedToken(value: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.length > MAX_TOKEN_LENGTH) return null;
  return normalized;
}

export type ExtractedPrivyTokens =
  | { ok: true; accessToken: string; identityToken: string }
  | {
      ok: false;
      code: "TOKEN_MISSING" | "TOKEN_MALFORMED" | "TOKEN_AMBIGUOUS";
    };

/**
 * Accept either Privy's documented bearer/header transport or its first-party
 * cookie transport. Two different values are ambiguous and therefore rejected.
 */
export function extractPrivyTokenPair(request: Request): ExtractedPrivyTokens {
  const authorization = request.headers.get("authorization");
  let accessHeader: string | null = null;
  if (authorization) {
    const match = authorization.match(/^Bearer ([^\s]+)$/);
    if (!match) return { ok: false, code: "TOKEN_MALFORMED" };
    accessHeader = boundedToken(match[1] ?? null);
    if (!accessHeader) return { ok: false, code: "TOKEN_MALFORMED" };
  }

  const accessCookie = boundedToken(cookieValue(request, "privy-token"));
  if (accessHeader && accessCookie && accessHeader !== accessCookie) {
    return { ok: false, code: "TOKEN_AMBIGUOUS" };
  }

  const identityHeader = boundedToken(request.headers.get("privy-id-token"));
  const identityCookie = boundedToken(cookieValue(request, "privy-id-token"));
  if (identityHeader && identityCookie && identityHeader !== identityCookie) {
    return { ok: false, code: "TOKEN_AMBIGUOUS" };
  }

  const accessToken = accessHeader ?? accessCookie;
  const identityToken = identityHeader ?? identityCookie;
  if (!accessToken || !identityToken) return { ok: false, code: "TOKEN_MISSING" };
  return { ok: true, accessToken, identityToken };
}

/** Cross-site browser reads are rejected; same-origin and non-browser clients pass. */
export function isAllowedPrivyRequestOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;
  try {
    return new URL(origin).origin === canonicalAppOrigin(request);
  } catch {
    return false;
  }
}

export interface VerifiedPrivyIdentity {
  privyUserId: string;
  supabaseUserId: string;
  sessionId: string;
  expiresAt: number;
  walletAddresses: string[];
}

export type PrivyIdentityResult =
  | { ok: true; identity: VerifiedPrivyIdentity }
  | {
      ok: false;
      code:
        | "PRIVY_NOT_CONFIGURED"
        | "ORIGIN_REJECTED"
        | "TOKEN_MISSING"
        | "TOKEN_MALFORMED"
        | "TOKEN_AMBIGUOUS"
        | "TOKEN_INVALID"
        | "TOKEN_PAIR_MISMATCH"
        | "IDENTITY_BRIDGE_MISMATCH";
    };

interface PrivyVerifier {
  access: (input: {
    access_token: string;
    app_id: string;
    verification_key: string;
  }) => Promise<VerifyAccessTokenResponse>;
  identity: (input: {
    identity_token: string;
    app_id: string;
    verification_key: string;
  }) => Promise<PrivyUser>;
}

const officialVerifier: PrivyVerifier = {
  access: verifyAccessToken,
  identity: verifyIdentityToken,
};

export async function verifyPrivyIdentityBridge(
  request: Request,
  supabaseUserId: string,
  config: PrivyServerConfig | null = privyServerConfig(),
  verifier: PrivyVerifier = officialVerifier,
): Promise<PrivyIdentityResult> {
  if (!isAllowedPrivyRequestOrigin(request)) return { ok: false, code: "ORIGIN_REJECTED" };
  if (!config) return { ok: false, code: "PRIVY_NOT_CONFIGURED" };

  const tokens = extractPrivyTokenPair(request);
  if (!tokens.ok) return tokens;

  try {
    const [access, identity] = await Promise.all([
      verifier.access({
        access_token: tokens.accessToken,
        app_id: config.appId,
        verification_key: config.verificationKey,
      }),
      verifier.identity({
        identity_token: tokens.identityToken,
        app_id: config.appId,
        verification_key: config.verificationKey,
      }),
    ]);

    // The official SDK already validates these claims; retaining the explicit
    // checks keeps the local trust contract obvious and protects test doubles.
    if (access.app_id !== config.appId || access.issuer !== PRIVY_ISSUER) {
      return { ok: false, code: "TOKEN_INVALID" };
    }
    if (access.user_id !== identity.id) {
      return { ok: false, code: "TOKEN_PAIR_MISMATCH" };
    }

    const customAuth = identity.linked_accounts.find(
      (account) => account.type === "custom_auth",
    );
    if (!customAuth || customAuth.custom_user_id !== supabaseUserId) {
      return { ok: false, code: "IDENTITY_BRIDGE_MISMATCH" };
    }

    const walletAddresses = [
      ...new Set(
        identity.linked_accounts.flatMap((account) =>
          (account.type === "wallet" || account.type === "smart_wallet") && account.address
            ? [account.address]
            : [],
        ),
      ),
    ];
    return {
      ok: true,
      identity: {
        privyUserId: access.user_id,
        supabaseUserId,
        sessionId: access.session_id,
        expiresAt: access.expiration,
        walletAddresses,
      },
    };
  } catch {
    return { ok: false, code: "TOKEN_INVALID" };
  }
}

export const privyServerInternals = {
  normalizeVerificationKey,
  cookieValue,
  boundedToken,
  maxTokenLength: MAX_TOKEN_LENGTH,
};
