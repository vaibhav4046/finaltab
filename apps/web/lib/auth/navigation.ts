const DEFAULT_NEXT = "/app";

/** Keep post-auth redirects on this application and out of protocol routes. */
export function safeNextPath(value: string | null | undefined, fallback = DEFAULT_NEXT): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;

  try {
    const parsed = new URL(value, "https://finaltab.invalid");
    if (parsed.origin !== "https://finaltab.invalid") return fallback;
    const isWorkspace = parsed.pathname === "/app" || parsed.pathname.startsWith("/app/");
    const isInviteJoin = parsed.pathname === "/join";
    if (!isWorkspace && !isInviteJoin) return fallback;
    // Fragments can carry proof or invite capabilities. Never tunnel them
    // through the server-visible `next` query. /join has no legitimate query
    // state; its single-use token is carried by the encrypted HttpOnly handoff.
    if (isInviteJoin) return "/join";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function canonicalAppOrigin(request: Request): string {
  const configured = process.env.FINALTAB_APP_ORIGIN?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      const localDevelopment =
        process.env.NODE_ENV !== "production" &&
        parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
      if (
        (parsed.protocol === "https:" || localDevelopment) &&
        !parsed.username &&
        !parsed.password &&
        parsed.pathname === "/" &&
        !parsed.search &&
        !parsed.hash
      ) {
        return parsed.origin;
      }
    } catch {
      // Fall through to the request's already-parsed origin.
    }
  }
  return new URL(request.url).origin;
}

/**
 * State-changing cookie-session routes require an exact Origin. Browsers send
 * Origin on POST; rejecting a missing value also rejects legacy cross-site
 * form submissions instead of guessing from Host or Referer.
 */
export function isSameOriginMutation(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return true;
  }
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).origin === canonicalAppOrigin(request);
  } catch {
    return false;
  }
}
