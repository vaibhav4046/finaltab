import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routeProtection } from "@/lib/security";
import { supabasePublicConfig } from "./config";

function nextResponse(requestHeaders: Headers) {
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function protectedFailure(
  request: NextRequest,
  status: 401 | 503,
  code: "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED",
) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return Response.json(
      {
        ok: false,
        error: code,
        message:
          status === 503
            ? "Account authentication is not configured for this deployment."
            : "Sign in before using this endpoint.",
      },
      {
        status,
        headers: {
          "cache-control": "private, no-store",
          "x-finaltab-auth": status === 503 ? "not-configured" : "anonymous",
          ...(status === 401 ? { "www-authenticate": 'Bearer realm="finaltab"' } : {}),
        },
      },
    );
  }

  const login = request.nextUrl.clone();
  login.pathname = "/auth";
  login.search = "";
  login.searchParams.set(
    "error",
    status === 503 ? "cloud-not-configured" : "session-required",
  );
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(login);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("x-finaltab-auth", status === 503 ? "not-configured" : "anonymous");
  return response;
}

export async function refreshSupabaseSession(
  request: NextRequest,
  requestHeaders = new Headers(request.headers),
) {
  const protection = routeProtection(request.nextUrl.pathname);
  const config = supabasePublicConfig();
  if (!config) {
    if (protection === "supabase-session") {
      return protectedFailure(request, 503, "AUTH_NOT_CONFIGURED");
    }
    const response = nextResponse(requestHeaders);
    response.headers.set("x-finaltab-auth", "not-configured");
    return response;
  }

  let response = nextResponse(requestHeaders);
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse(requestHeaders);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // getClaims validates the JWT signature and refreshes expired sessions.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && protection === "supabase-session") {
    return protectedFailure(request, 401, "AUTH_REQUIRED");
  }

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("x-finaltab-auth", data?.claims ? "authenticated" : "anonymous");
  return response;
}
