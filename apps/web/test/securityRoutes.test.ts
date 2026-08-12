import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { canonicalAppOrigin, isSameOriginMutation, safeNextPath } from "@/lib/auth/navigation";
import {
  applyBrowserSecurityHeaders,
  buildContentSecurityPolicy,
  routeProtection,
} from "@/lib/security";
import { authFeatureFlags } from "@/lib/auth/features";
import { refreshSupabaseSession, supabaseMiddlewareInternals } from "@/lib/supabase/middleware";

const ENV_KEYS = [
  "FINALTAB_APP_ORIGIN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "FINALTAB_GITHUB_OAUTH_ENABLED",
  "FINALTAB_TEAM_EMAIL_AUTH_ENABLED",
] as const;
const before = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = before[key];
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
});

describe("authentication route matrix", () => {
  it("keeps the optional Privy runtime on identity routes only", () => {
    const rootLayout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    const authLayout = readFileSync(new URL("../app/auth/layout.tsx", import.meta.url), "utf8");
    const appLayout = readFileSync(new URL("../app/app/layout.tsx", import.meta.url), "utf8");
    const routeProvider = readFileSync(new URL("../components/PrivyRouteProvider.tsx", import.meta.url), "utf8");

    expect(rootLayout).not.toMatch(/Privy|privy/);
    expect(authLayout).toContain("PrivyRouteProvider");
    expect(appLayout).not.toMatch(/Privy|privy/);
    expect(routeProvider).toContain('import { privyServerConfig } from "@/lib/privy/server"');
    expect(routeProvider).not.toContain("privyPublicConfig");
  });

  it("keeps the identity return provider-neutral with branded success, loading, and error states", () => {
    const completePage = readFileSync(new URL("../app/auth/complete/page.tsx", import.meta.url), "utf8");
    const completeLoading = readFileSync(new URL("../app/auth/complete/loading.tsx", import.meta.url), "utf8");
    const completeError = readFileSync(new URL("../app/auth/complete/error.tsx", import.meta.url), "utf8");

    expect(completePage).toContain("Identity verified. Secure session ready.");
    expect(completePage).not.toContain("Account restored");
    expect(completeLoading).toContain("Verifying your secure return.");
    expect(completeError).toContain("We could not verify this return.");
    expect(completeError).toContain("Restart sign-in");
  });

  it("keeps GitHub and email rendering intent server-only and opt-in", () => {
    delete mutableEnv.FINALTAB_GITHUB_OAUTH_ENABLED;
    delete mutableEnv.FINALTAB_TEAM_EMAIL_AUTH_ENABLED;
    expect(authFeatureFlags()).toEqual({
      githubOAuthEnabled: false,
      teamEmailAuthEnabled: false,
    });

    mutableEnv.FINALTAB_GITHUB_OAUTH_ENABLED = "true";
    mutableEnv.FINALTAB_TEAM_EMAIL_AUTH_ENABLED = "true";
    expect(authFeatureFlags()).toEqual({
      githubOAuthEnabled: true,
      teamEmailAuthEnabled: true,
    });
  });

  it("uses correlated SSR PKCE for GitHub and hides email behind a separate server flag", () => {
    const panel = readFileSync(new URL("../components/CloudAccessPanel.tsx", import.meta.url), "utf8");
    const authPanel = readFileSync(new URL("../components/AuthPanel.tsx", import.meta.url), "utf8");
    const browserClient = readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");
    const callback = readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");

    expect(authPanel).toContain("authFeatureFlags()");
    expect(panel).toContain('provider: "github"');
    expect(panel).toContain('new URL("/auth/callback", window.location.origin)');
    expect(panel).toContain("callback.searchParams.set(\"next\", requestedNextPath())");
    expect(panel).toContain("teamEmailAuthEnabled ? (");
    expect(panel).toContain("this UI gate is not a membership allowlist");
    expect(panel).not.toContain("NEXT_PUBLIC_GITHUB");
    expect(browserClient).toContain("appendPkceFlowIdToRedirects: true");
    expect(callback).toContain('oneQueryValue(url, "sb_flow_id")');
    expect(callback).toContain("(code && !flowId)");
    expect(callback).toContain("exchangeCodeForSession(code, { flowId: flowId! })");
    expect(callback).toContain('url.searchParams.has("error")');
    expect(callback).toContain('url.searchParams.has("error_description")');
    expect(callback).not.toMatch(/get(?:All)?\("error_description"\)/);
  });

  it("ships a branded, script-free email template with link and OTP fallback", () => {
    const email = readFileSync(
      new URL("../../../supabase/email-templates/access.html", import.meta.url),
      "utf8",
    );
    expect(email).toContain("{{ .ConfirmationURL }}");
    expect(email).toContain("{{ .Token }}");
    expect(email).toContain("{{ .Email }}");
    expect(email).toContain("FINAL<span");
    expect(email).not.toMatch(/<script|<form|<img[^>]+src=["']https?:/i);
  });

  it.each([
    "/",
    "/auth",
    "/auth/sign-in",
    "/auth/create-account",
    "/auth/callback",
    "/developers",
    "/api/health",
    "/api/mcp",
    "/api/settle/execute",
    "/api/vision/extract",
    "/api/voice/token",
    "/api/agents/runs",
  ])("leaves %s public or under its handler's exact policy", (pathname) => {
    expect(routeProtection(pathname)).toBe("public-or-handler");
  });

  it.each(["/app", "/app/tab", "/app/proof", "/auth/complete"])(
    "protects browser page %s with the Supabase session",
    (pathname) => {
      expect(routeProtection(pathname)).toBe("supabase-session");
    },
  );

  it("keeps only exact proof capsules public so fragment capabilities can load", () => {
    expect(routeProtection("/app/proof/execution-123")).toBe("public-or-handler");
  });

  it.each(["/api/privy/session", "/api/privy/future"])(
    "requires a Privy token pair on %s in addition to handler checks",
    (pathname) => {
      expect(routeProtection(pathname)).toBe("privy-token-pair");
    },
  );

  it("lets a no-cookie scoped API request reach its handler while redirecting an anonymous page", async () => {
    delete mutableEnv.NEXT_PUBLIC_SUPABASE_URL;
    delete mutableEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete mutableEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const api = await refreshSupabaseSession(new NextRequest("http://localhost:3017/api/settle/execute", {
      method: "POST",
      headers: { authorization: "Bearer ft_explicit_scoped_token_123456789" },
    }));
    expect(api.headers.get("x-middleware-next")).toBe("1");
    expect(api.headers.get("x-finaltab-auth")).toBe("not-configured");

    const page = await refreshSupabaseSession(new NextRequest("http://localhost:3017/app/tab?from=test"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/auth?error=cloud-not-configured");
    expect(page.headers.get("location")).toContain("next=%2Fapp%2Ftab%3Ffrom%3Dtest");
  });

  it("skips Supabase work for configured no-cookie public traffic and fails protected pages immediately", async () => {
    mutableEnv.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    mutableEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

    const publicRequest = new NextRequest("https://finaltab.example/developers");
    expect(supabaseMiddlewareInternals.hasSupabaseSessionCookie(publicRequest)).toBe(false);
    const publicResponse = await refreshSupabaseSession(publicRequest);
    expect(publicResponse.headers.get("x-middleware-next")).toBe("1");
    expect(publicResponse.headers.get("x-finaltab-auth")).toBe("anonymous");

    const protectedResponse = await refreshSupabaseSession(
      new NextRequest("https://finaltab.example/app/agents"),
    );
    expect(protectedResponse.status).toBe(307);
    expect(protectedResponse.headers.get("location")).toContain("error=session-required");
  });
});

describe("safe auth navigation", () => {
  it.each([
    ["/app/tab?draft=1#review-capability", "/app/tab?draft=1"],
    ["/join?token=server-visible#single-use-token", "/join"],
    ["https://attacker.example", "/app"],
    ["//attacker.example", "/app"],
    ["/\\attacker.example", "/app"],
    ["/auth/callback?code=secret", "/app"],
    ["/auth/signout", "/app"],
    ["/auth/complete", "/app"],
    ["/api/health", "/app"],
    ["/_next/static/chunk.js", "/app"],
    ["/appetite", "/app"],
  ])("normalizes next=%s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it("uses one configured canonical HTTPS origin and rejects cross-origin mutations", () => {
    mutableEnv.FINALTAB_APP_ORIGIN = "https://finaltab.example";
    const sameOrigin = new Request("https://internal-host/auth/signout", {
      method: "POST",
      headers: { origin: "https://finaltab.example" },
    });
    const crossOrigin = new Request("https://internal-host/auth/signout", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    const missingOrigin = new Request("https://internal-host/auth/signout", { method: "POST" });

    expect(canonicalAppOrigin(sameOrigin)).toBe("https://finaltab.example");
    expect(isSameOriginMutation(sameOrigin)).toBe(true);
    expect(isSameOriginMutation(crossOrigin)).toBe(false);
    expect(isSameOriginMutation(missingOrigin)).toBe(false);
  });
});

describe("browser security policy", () => {
  it("contains the official Privy sources, a nonce, and production hardening", () => {
    const csp = buildContentSecurityPolicy("0123456789abcdef0123456789abcdef", {
      privyEnabled: true,
      supabaseUrl: "https://project.supabase.co",
      privyApiUrl: "https://privy.accounts.example",
    });
    expect(csp).toContain("'nonce-0123456789abcdef0123456789abcdef'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("https://auth.privy.io");
    expect(csp).toContain("wss://relay.walletconnect.com");
    expect(csp).toContain("wss://www.walletlink.org");
    expect(csp).toContain("https://*.rpc.privy.systems");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("omits Privy origins when the optional bridge is disabled", () => {
    const csp = buildContentSecurityPolicy("0123456789abcdef0123456789abcdef", {
      privyApiUrl: "https://privy.accounts.example",
      supabaseUrl: "https://project.supabase.co",
    });

    expect(csp).not.toContain("https://auth.privy.io");
    expect(csp).not.toContain("https://*.rpc.privy.systems");
    expect(csp).not.toContain("https://privy.accounts.example");
    expect(csp).toContain("https://verify.walletconnect.com");
    expect(csp).toContain("https://project.supabase.co");
  });

  it("preserves same-origin camera and microphone while denying framing", () => {
    const csp = buildContentSecurityPolicy("abcdef0123456789abcdef0123456789");
    const response = applyBrowserSecurityHeaders(new Response(null), csp);
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(self), geolocation=(), microphone=(self), payment=()",
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});
