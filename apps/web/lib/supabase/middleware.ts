import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "./config";

export async function refreshSupabaseSession(request: NextRequest) {
  const config = supabasePublicConfig();
  if (!config) {
    const response = NextResponse.next({ request });
    response.headers.set("x-finaltab-auth", "not-configured");
    return response;
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // getClaims validates the JWT signature and refreshes expired sessions.
  const { data } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  const protectedPath =
    pathname.startsWith("/app") ||
    pathname.startsWith("/api/settle") ||
    pathname.startsWith("/api/vision");

  if (!data?.claims && protectedPath) {
    if (pathname.startsWith("/api/")) {
      return Response.json(
        { ok: false, error: "AUTH_REQUIRED", message: "Sign in before using this endpoint." },
        { status: 401, headers: { "cache-control": "private, no-store" } },
      );
    }
    const login = request.nextUrl.clone();
    login.pathname = "/auth";
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("x-finaltab-auth", data?.claims ? "authenticated" : "anonymous");
  return response;
}
