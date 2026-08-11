import "server-only";

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Authentication surfaces are enabled only by explicit server-side intent.
 * These booleans may be passed to client components, but the environment
 * variables themselves must never use a NEXT_PUBLIC_ prefix.
 */
export function authFeatureFlags() {
  return {
    githubOAuthEnabled: enabled(process.env.FINALTAB_GITHUB_OAUTH_ENABLED),
    teamEmailAuthEnabled: enabled(process.env.FINALTAB_TEAM_EMAIL_AUTH_ENABLED),
  } as const;
}
