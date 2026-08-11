import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { canonicalAppOrigin, safeNextPath } from "@/lib/auth/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

function emailOtpType(value: string | null): EmailOtpType | null {
  return value && EMAIL_OTP_TYPES.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

function authRedirect(origin: string, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function oneQueryValue(url: URL, key: string): string | null {
  const values = url.searchParams.getAll(key);
  return values.length === 1 ? values[0] ?? null : null;
}

function pkceFlowId(value: string | null): string | null {
  return value && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = canonicalAppOrigin(request);
  const code = oneQueryValue(url, "code");
  const tokenHash = oneQueryValue(url, "token_hash");
  const type = emailOtpType(oneQueryValue(url, "type"));
  const rawFlowId = oneQueryValue(url, "sb_flow_id");
  const flowId = pkceFlowId(rawFlowId);
  const next = safeNextPath(url.searchParams.get("next"));
  const client = await createServerSupabaseClient();

  if (!client) {
    return authRedirect(
      origin,
      `/auth?error=cloud-not-configured&next=${encodeURIComponent(next)}`,
    );
  }
  if (
    url.searchParams.has("error") ||
    url.searchParams.has("error_code") ||
    url.searchParams.has("error_description")
  ) {
    return authRedirect(
      origin,
      `/auth?error=oauth-provider-error&next=${encodeURIComponent(next)}`,
    );
  }
  if (
    (code && tokenHash) ||
    (!code && !tokenHash) ||
    (code && !flowId) ||
    (tokenHash && !type) ||
    url.searchParams.getAll("code").length > 1 ||
    url.searchParams.getAll("token_hash").length > 1 ||
    url.searchParams.getAll("type").length > 1 ||
    url.searchParams.getAll("sb_flow_id").length > 1 ||
    url.searchParams.getAll("next").length > 1 ||
    (rawFlowId !== null && flowId === null)
  ) {
    return authRedirect(
      origin,
      `/auth?error=missing-or-ambiguous-code&next=${encodeURIComponent(next)}`,
    );
  }

  let error: unknown;
  try {
    const result = code
      ? await client.auth.exchangeCodeForSession(code, { flowId: flowId! })
      : await client.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
    error = result.error;
  } catch {
    error = new Error("Auth exchange unavailable");
  }
  if (error) {
    return authRedirect(
      origin,
      `/auth?error=invalid-or-expired-link&next=${encodeURIComponent(next)}`,
    );
  }

  return authRedirect(
    origin,
    `/auth/complete?next=${encodeURIComponent(next)}`,
  );
}
