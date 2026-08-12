import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalAppOrigin } from "@/lib/auth/navigation";
import { createClient } from "@supabase/supabase-js";
import { authenticatedUser } from "@/lib/supabase/server";
import { supabasePublicConfig } from "@/lib/supabase/config";

export type ApiScope =
  | "tabs:read"
  | "tabs:write"
  | "receipts:write"
  | "settlements:prepare"
  | "settlements:submit"
  | "settlements:read";

export interface ApiPrincipal {
  subject: string;
  name: string;
  scopes: ReadonlySet<ApiScope>;
  source: "session" | "bearer-jwt" | "bearer-token";
  rateKey: string;
}

interface TokenConfig {
  name: string;
  subject: string;
  tokenSha256: string;
  scopes: ApiScope[];
}

const VALID_SCOPES = new Set<ApiScope>([
  "tabs:read",
  "tabs:write",
  "receipts:write",
  "settlements:prepare",
  "settlements:submit",
  "settlements:read",
]);

// A normal signed-in product user may collaborate, prepare and inspect a
// settlement. Value-moving submission is deliberately absent: that capability
// must be granted explicitly in app_metadata.finaltab_scopes (or on a hashed
// bearer token). This keeps a newly created Supabase user useful without making
// missing authorization metadata equivalent to an onchain broadcast grant.
const DEFAULT_SESSION_SCOPES: readonly ApiScope[] = [
  "tabs:read",
  "tabs:write",
  "receipts:write",
  "settlements:prepare",
  "settlements:read",
];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function configuredTokens(): TokenConfig[] {
  const raw = process.env.FINALTAB_API_TOKENS_JSON;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): TokenConfig[] => {
      if (!entry || typeof entry !== "object") return [];
      const value = entry as Record<string, unknown>;
      if (
        typeof value.name !== "string" ||
        typeof value.subject !== "string" ||
        typeof value.tokenSha256 !== "string" ||
        !/^[0-9a-f]{64}$/i.test(value.tokenSha256) ||
        !Array.isArray(value.scopes)
      ) return [];
      const scopes = value.scopes.filter(
        (scope): scope is ApiScope => typeof scope === "string" && VALID_SCOPES.has(scope as ApiScope),
      );
      return [{ name: value.name, subject: value.subject, tokenSha256: value.tokenSha256.toLowerCase(), scopes }];
    });
  } catch {
    return [];
  }
}

function tokenPrincipal(token: string): ApiPrincipal | null {
  const digest = Buffer.from(sha256(token), "hex");
  for (const configured of configuredTokens()) {
    const expected = Buffer.from(configured.tokenSha256, "hex");
    if (expected.length === digest.length && timingSafeEqual(expected, digest)) {
      return {
        subject: configured.subject,
        name: configured.name,
        scopes: new Set(configured.scopes),
        source: "bearer-token",
        rateKey: configured.tokenSha256,
      };
    }
  }
  return null;
}

function scopesFromAppMetadata(metadata: Record<string, unknown> | undefined): Set<ApiScope> {
  const raw = metadata?.finaltab_scopes;
  if (raw === undefined) return new Set(DEFAULT_SESSION_SCOPES);
  // A malformed claim fails closed instead of silently inheriting defaults.
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw.filter((scope): scope is ApiScope => typeof scope === "string" && VALID_SCOPES.has(scope as ApiScope)),
  );
}

export class ApiPayloadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`request body exceeds ${maxBytes} bytes`);
    this.name = "ApiPayloadTooLargeError";
  }
}

/**
 * Parse JSON while enforcing the bytes actually received. Content-Length is
 * only an early hint; chunked requests and dishonest headers are still bounded.
 */
export async function readJsonBodyWithLimit(request: Request, maxBytes: number): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("maxBytes must be a positive safe integer");

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("invalid Content-Length");
    if (parsed > maxBytes) throw new ApiPayloadTooLargeError(maxBytes);
  }

  if (!request.body) throw new SyntaxError("JSON request body is required");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let raw = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new ApiPayloadTooLargeError(maxBytes);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(raw);
}

async function jwtPrincipal(token: string): Promise<ApiPrincipal | null> {
  const config = supabasePublicConfig();
  if (!config || token.split(".").length !== 3) return null;
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    subject: data.user.id,
    name: data.user.email ?? "Supabase user",
    scopes: scopesFromAppMetadata(data.user.app_metadata),
    source: "bearer-jwt",
    rateKey: sha256(data.user.id),
  };
}

export async function requestPrincipal(request: Request): Promise<ApiPrincipal | null> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    if (token.length < 24 || token.length > 4096) return null;
    return tokenPrincipal(token) ?? (await jwtPrincipal(token));
  }

  const { configured, user } = await authenticatedUser();
  // Development is not an authentication mechanism. Local callers must use a
  // real Supabase session or an explicitly configured, least-privilege token.
  if (!configured || !user) return null;
  return {
    subject: user.id,
    name: user.email ?? "Supabase user",
    scopes: scopesFromAppMetadata(user.app_metadata),
    source: "session",
    rateKey: sha256(user.id),
  };
}

interface Bucket {
  count: number;
  resetsAt: number;
}

declare global {
  var __finaltabRateBuckets: Map<string, Bucket> | undefined;
}

const buckets = globalThis.__finaltabRateBuckets ?? new Map<string, Bucket>();
globalThis.__finaltabRateBuckets = buckets;

function rateLimit(rateKey: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(rateKey);
  const bucket = !existing || existing.resetsAt <= now
    ? { count: 0, resetsAt: now + windowMs }
    : existing;
  bucket.count += 1;
  buckets.set(rateKey, bucket);
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetsAt - now) / 1000)),
  };
}

export interface AccessOptions {
  scope: ApiScope;
  /**
   * Cookie sessions may satisfy a stronger API scope with this narrower scope
   * only when the route performs an additional session-bound authorization
   * ceremony (for example, an exact-plan wallet signature). Bearer JWTs and API
   * tokens never receive this fallback.
   */
  sessionFallbackScope?: ApiScope;
  maxBytes?: number;
  rateLimit?: number;
  rateWindowMs?: number;
  requireSameOriginForSession?: boolean;
}

function principalHasRequiredScope(principal: ApiPrincipal, options: AccessOptions): boolean {
  if (principal.scopes.has(options.scope)) return true;
  return principal.source === "session" &&
    options.sessionFallbackScope !== undefined &&
    principal.scopes.has(options.sessionFallbackScope);
}

function hasCanonicalSessionOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).origin === canonicalAppOrigin(request);
  } catch {
    return false;
  }
}

export type AccessResult =
  | { ok: true; principal: ApiPrincipal; headers: Headers }
  | { ok: false; response: Response };

export async function authorizeApiRequest(
  request: Request,
  options: AccessOptions,
): Promise<AccessResult> {
  const maxBytes = options.maxBytes ?? 512_000;
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    return {
      ok: false,
      response: Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes }, { status: 413 }),
    };
  }

  const principal = await requestPrincipal(request);
  if (!principal) {
    return {
      ok: false,
      response: Response.json(
        { error: "AUTH_REQUIRED", message: "Use a Supabase session or scoped bearer token." },
        { status: 401, headers: { "www-authenticate": "Bearer", "cache-control": "no-store" } },
      ),
    };
  }
  if (!principalHasRequiredScope(principal, options)) {
    return {
      ok: false,
      response: Response.json({ error: "SCOPE_REQUIRED", scope: options.scope }, { status: 403 }),
    };
  }

  if (
    principal.source === "session" &&
    options.requireSameOriginForSession !== false
  ) {
    if (!hasCanonicalSessionOrigin(request)) {
      return { ok: false, response: Response.json({ error: "ORIGIN_REJECTED" }, { status: 403 }) };
    }
  }

  const limit = rateLimit(
    `${principal.rateKey}:${options.scope}`,
    options.rateLimit ?? 30,
    options.rateWindowMs ?? 60_000,
  );
  const headers = new Headers({
    "x-ratelimit-remaining": String(limit.remaining),
    "cache-control": "private, no-store",
  });
  if (!limit.allowed) {
    headers.set("retry-after", String(limit.retryAfterSeconds));
    return {
      ok: false,
      response: Response.json({ error: "RATE_LIMITED" }, { status: 429, headers }),
    };
  }
  return { ok: true, principal, headers };
}

export function withAccessHeaders(response: Response, headers: Headers): Response {
  headers.forEach((value, name) => response.headers.set(name, value));
  return response;
}

export const apiAccessInternals = {
  sha256,
  configuredTokens,
  tokenPrincipal,
  scopesFromAppMetadata,
  principalHasRequiredScope,
  hasCanonicalSessionOrigin,
  defaultSessionScopes: DEFAULT_SESSION_SCOPES,
};
