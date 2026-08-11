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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = canonicalAppOrigin(request);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = emailOtpType(url.searchParams.get("type"));
  const next = safeNextPath(url.searchParams.get("next"));
  const client = await createServerSupabaseClient();

  if (!client) {
    return authRedirect(
      origin,
      `/auth?error=cloud-not-configured&next=${encodeURIComponent(next)}`,
    );
  }
  if ((code && tokenHash) || (!code && !tokenHash) || (tokenHash && !type)) {
    return authRedirect(
      origin,
      `/auth?error=missing-or-ambiguous-code&next=${encodeURIComponent(next)}`,
    );
  }

  const { error } = code
    ? await client.auth.exchangeCodeForSession(code)
    : await client.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
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
