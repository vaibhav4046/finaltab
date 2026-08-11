import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { InviteTokenSchema } from "@/lib/server/tabCollaboration";

export const INVITE_HANDOFF_COOKIE = "finaltab_invite_handoff";
export const INVITE_HANDOFF_TTL_SECONDS = 30 * 60;

const VERSION = 1;
const AAD = Buffer.from("finaltab/invite-handoff/v1", "utf8");

function encryptionKey(): Buffer | null {
  const secret = process.env.FINALTAB_PROOF_SIGNING_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) return null;
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.alloc(0),
    AAD,
    32,
  ));
}

interface InviteHandoffPayload {
  version: typeof VERSION;
  token: string;
  expiresAt: number;
}

export function sealInviteHandoff(
  token: string,
  options: { nowSeconds?: number } = {},
): string | null {
  const key = encryptionKey();
  if (!key) return null;
  const normalizedToken = InviteTokenSchema.parse(token);
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error("invalid invite handoff clock");

  const payload: InviteHandoffPayload = {
    version: VERSION,
    token: normalizedToken,
    expiresAt: nowSeconds + INVITE_HANDOFF_TTL_SECONDS,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function openInviteHandoff(
  value: string | null | undefined,
  options: { nowSeconds?: number } = {},
): string | null {
  const key = encryptionKey();
  if (!key || !value || value.length < 80 || value.length > 512) return null;
  try {
    const packed = Buffer.from(value, "base64url");
    // Node accepts non-canonical Base64URL spellings whose unused trailing
    // bits decode to the same bytes. Require the one canonical encoding so a
    // cookie has exactly one serialized representation before authentication.
    if (packed.toString("base64url") !== value) return null;
    if (packed.length < 29) return null;
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8")) as Partial<InviteHandoffPayload>;
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
    if (
      payload.version !== VERSION ||
      !Number.isSafeInteger(payload.expiresAt) ||
      (payload.expiresAt ?? 0) <= nowSeconds ||
      (payload.expiresAt ?? 0) > nowSeconds + INVITE_HANDOFF_TTL_SECONDS
    ) return null;
    const token = InviteTokenSchema.safeParse(payload.token);
    return token.success ? token.data : null;
  } catch {
    return null;
  }
}

export function inviteHandoffFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === INVITE_HANDOFF_COOKIE) return openInviteHandoff(rest.join("="));
  }
  return null;
}

export function inviteHandoffCookie(value: string, requestUrl: string, maxAgeSeconds: number): string {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${INVITE_HANDOFF_COOKIE}=${value}; Path=/api/invites; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearInviteHandoffCookie(requestUrl: string): string {
  return inviteHandoffCookie("", requestUrl, 0);
}
