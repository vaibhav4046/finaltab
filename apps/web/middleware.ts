import type { NextRequest } from "next/server";
import {
  applyBrowserSecurityHeaders,
  buildContentSecurityPolicy,
} from "@/lib/security";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = buildContentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV !== "production",
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
