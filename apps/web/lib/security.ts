export type RouteProtection = "public-or-handler" | "supabase-session" | "privy-token-pair";

export function routeProtection(pathname: string): RouteProtection {
  if (pathname === "/api/privy/session" || pathname.startsWith("/api/privy/")) {
    return "privy-token-pair";
  }
  // An exact settlement capsule is a public shell by design: its read-only
  // capability arrives in the URL fragment and therefore cannot be inspected
  // by middleware. The status API still requires either that exact capability
  // or an authenticated settlements:read principal. Keep the generic proof
  // lookup signed-in so this exception cannot become a public query surface.
  if (pathname.startsWith("/app/proof/")) {
    return "public-or-handler";
  }
  if (
    pathname === "/auth/complete" ||
    pathname.startsWith("/auth/complete/") ||
    pathname === "/app" ||
    pathname.startsWith("/app/")
  ) {
    return "supabase-session";
  }
  return "public-or-handler";
}

function validHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

export interface CspOptions {
  development?: boolean;
  privyApiUrl?: string;
  supabaseUrl?: string;
}

/** CSP sources follow Privy's official web integration allowlist. */
export function buildContentSecurityPolicy(nonce: string, options: CspOptions = {}): string {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
    throw new Error("CSP nonce must be an opaque base64url value");
  }

  const customPrivyOrigin = validHttpsOrigin(options.privyApiUrl);
  const supabaseOrigin = validHttpsOrigin(options.supabaseUrl);
  const customSources = [customPrivyOrigin, supabaseOrigin].filter(
    (source): source is string => Boolean(source),
  );
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://challenges.cloudflare.com",
    ...(options.development ? ["'unsafe-eval'"] : []),
  ];
  const frames = [
    "https://auth.privy.io",
    "https://verify.walletconnect.com",
    "https://verify.walletconnect.org",
    "https://challenges.cloudflare.com",
    ...(customPrivyOrigin ? [customPrivyOrigin] : []),
  ];
  const connect = [
    "'self'",
    "https://auth.privy.io",
    "wss://relay.walletconnect.com",
    "wss://relay.walletconnect.org",
    "wss://www.walletlink.org",
    "https://*.rpc.privy.systems",
    "https://explorer-api.walletconnect.com",
    "https://sepolia.base.org",
    "https://streaming.eu.assemblyai.com",
    "wss://streaming.eu.assemblyai.com",
    ...customSources,
    ...(supabaseOrigin
      ? [`wss://${new URL(supabaseOrigin).host}`]
      : []),
    ...(options.development ? ["ws://localhost:*", "http://localhost:*"] : []),
  ];

  const directives = [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `child-src ${frames.join(" ")}`,
    `frame-src ${frames.join(" ")}`,
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(options.development ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function applyBrowserSecurityHeaders(response: Response, csp: string): Response {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "camera=(self), geolocation=(), microphone=(self), payment=()");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
