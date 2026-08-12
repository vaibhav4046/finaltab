import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { authenticatedUser } from "@/lib/supabase/server";
import { ApiPayloadTooLargeError, readJsonBodyWithLimit } from "@/lib/server/apiAccess";

const CLOUD_MUTATION_MAX_BYTES = 32_768;

const WalletAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a complete 0x wallet address.")
  .transform((value) => value.toLowerCase() as `0x${string}`);

const SettlementCurrencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value): value is "USD" => value === "USD", "FINALTab settlements use USD only.");

export const CreateTabSchema = z.object({
  title: z.string().trim().min(1).max(80),
  currency: SettlementCurrencySchema,
});

export const UpdateTabSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    currency: SettlementCurrencySchema.optional(),
    payerParticipantId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one draft field to update.");

export const AddParticipantSchema = z.object({
  displayName: z.string().trim().min(1).max(64),
  walletAddress: z.union([WalletAddressSchema, z.literal(""), z.null()]).optional()
    .transform((value) => value || null),
  attachSelf: z.boolean().optional().default(false),
});

export const CreateInviteSchema = z.object({
  participantId: z.string().uuid(),
  expiresInHours: z.number().int().min(1).max(168).optional().default(48),
});

export const InviteTokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/);

export const JoinInviteSchema = z.object({ token: InviteTokenSchema });

export const ApprovalDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  status: z.enum(["rejected", "revoked"]),
});

export function createInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(InviteTokenSchema.parse(token), "utf8").digest("hex");
}

export function inviteExpiry(expiresInHours: number, now = Date.now()): string {
  const hours = z.number().int().min(1).max(168).parse(expiresInHours);
  return new Date(now + hours * 60 * 60 * 1_000).toISOString();
}

export async function requireCloudUser() {
  const auth = await authenticatedUser();
  if (!auth.configured || !auth.client) {
    return {
      ok: false as const,
      response: Response.json(
        {
          ok: false,
          configured: false,
          error: "CLOUD_DISABLED",
          message: "Cloud collaboration is unavailable until Supabase credentials are provisioned.",
        },
        { status: 503, headers: { "cache-control": "private, no-store" } },
      ),
    };
  }
  if (!auth.user) {
    return {
      ok: false as const,
      response: Response.json(
        { ok: false, configured: true, error: "AUTH_REQUIRED", message: "Sign in to use cloud collaboration." },
        { status: 401, headers: { "cache-control": "private, no-store" } },
      ),
    };
  }
  return { ok: true as const, client: auth.client, user: auth.user };
}

export function rejectCrossOriginMutation(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site");
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1);
  const acceptedOrigins = new Set([requestUrl.origin]);
  if (forwardedHost) acceptedOrigins.add(`${forwardedProtocol}://${forwardedHost}`);
  let sourceOrigin = origin;
  if (!sourceOrigin && referer) {
    try { sourceOrigin = new URL(referer).origin; } catch { sourceOrigin = null; }
  }
  const sameOrigin = (sourceOrigin !== null && acceptedOrigins.has(sourceOrigin)) || fetchSite === "same-origin";
  if (!sameOrigin) {
    return Response.json(
      { ok: false, error: "ORIGIN_REJECTED", message: "Mutation requests must come from this FINALTab origin." },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  return null;
}

export function invalidBody(error: unknown): Response {
  if (error instanceof ApiPayloadTooLargeError) {
    return Response.json(
      { ok: false, error: "PAYLOAD_TOO_LARGE", maxBytes: error.maxBytes },
      { status: 413, headers: { "cache-control": "private, no-store" } },
    );
  }
  return Response.json(
    { ok: false, error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Invalid request body." },
    { status: 400, headers: { "cache-control": "private, no-store" } },
  );
}

export function readCloudJson(request: Request, maxBytes = CLOUD_MUTATION_MAX_BYTES): Promise<unknown> {
  return readJsonBodyWithLimit(request, maxBytes);
}

export function databaseUnavailable(code = "CLOUD_WRITE_FAILED"): Response {
  return Response.json(
    { ok: false, error: code, message: "The durable cloud record could not be committed. No success was recorded." },
    { status: 503, headers: { "cache-control": "private, no-store" } },
  );
}

export function privateJson(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "private, no-store");
  return Response.json(value, { ...init, headers });
}

export const tabCollaborationInternals = {
  WalletAddressSchema,
};
