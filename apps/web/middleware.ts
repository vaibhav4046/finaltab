import type { NextRequest } from "next/server";
import {
  applyBrowserSecurityHeaders,
  buildContentSecurityPolicy,
} from "@/lib/security";
import { privyPublicConfig } from "@/lib/privy/config";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

function hasPrivyVerificationKey(value: string | undefined): boolean {
  const normalized = value?.trim().replaceAll("\\n", "\n");
  if (!normalized || normalized.length > 16_384) return false;
  return Boolean(
    normalized.startsWith("-----BEGIN PUBLIC KEY-----\n") &&
    normalized.endsWith("\n-----END PUBLIC KEY-----"),
  );
}

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = buildContentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV !== "production",
    privyEnabled:
      Boolean(privyPublicConfig()) &&
      hasPrivyVerificationKey(process.env.PRIVY_VERIFICATION_KEY),
    privyApiUrl: process.env.NEXT_PUBLIC_PRIVY_API_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the request CSP to apply this nonce to framework scripts.
  requestHeaders.set("content-security-policy", csp);
  const response = await refreshSupabaseSession(request, requestHeaders);
  return applyBrowserSecurityHeaders(response, csp);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|mp3)$).*)",
  ],
};
