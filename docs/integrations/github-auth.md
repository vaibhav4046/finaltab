# GitHub sign-in through Supabase SSR PKCE

## Production contract

GitHub is FINALTab's primary public account-entry method. GitHub authenticates
the person; Supabase exchanges the one-time PKCE code, issues the cookie-backed
session, and remains the canonical `auth.uid()` / Row Level Security identity.
GitHub access tokens are not settlement, MCP, or wallet principals.

The product renders this path only when the server-only
`FINALTAB_GITHUB_OAUTH_ENABLED=true` flag is present. That flag records operator
intent; it does not prove that GitHub or Supabase is operational. `/api/health`
reports configuration intent, while release evidence still requires a real
same-device provider round trip and an authenticated RLS probe.

## Provider setup

1. Create one production GitHub OAuth App. Its GitHub **Authorization callback
   URL** is the Supabase broker callback, not the FINALTab callback:

   `https://yoavihmldqbkuxinrsih.supabase.co/auth/v1/callback`

2. Store the GitHub OAuth client ID and client secret only in Supabase
   **Authentication > Sign In / Providers > GitHub**. Neither credential belongs
   in the repository, browser environment, or Vercel application variables.
3. Set Supabase **Site URL** to the canonical production origin and allow the
   exact production callback path:

   `https://finaltab.vercel.app/auth/callback`

   The pinned Supabase client appends the reserved `sb_flow_id` query parameter
   (and FINALTab carries a normalized `next` value), so the URL configuration
   must tolerate query parameters on this exact callback path. Do not allow a
   different host or a generic shared-host wildcard in production.
4. Set `FINALTAB_APP_ORIGIN=https://finaltab.vercel.app` and only then set
   `FINALTAB_GITHUB_OAUTH_ENABLED=true` in the production server environment.
   Keep Preview false unless a separate controlled OAuth app and exact Preview
   origin are configured.

## Flow and security properties

1. `Continue with GitHub` calls `signInWithOAuth({ provider: "github" })` with
   `redirectTo` on the exact `/auth/callback` path.
2. `safeNextPath` permits only `/app`, `/app/**`, or `/join`; fragments,
   protocol routes, API routes, cross-origin URLs, backslashes, and control
   characters are removed or rejected.
3. `@supabase/ssr` stores the PKCE verifier in SameSite cookies. The pinned
   client appends a non-secret `sb_flow_id`; the callback strictly validates it
   and passes it to `exchangeCodeForSession` so overlapping tabs cannot consume
   the wrong verifier.
4. The callback rejects duplicate or mixed codes, invalid flow IDs, ambiguous
   continuations, and token-hash/code combinations. Provider error descriptions
   are never reflected; users receive one stable local error code.
5. The authenticated return and `/app/**` are session-protected and use
   request-scoped Supabase clients with private, no-store responses.

GitHub OAuth has a single honest semantic: the first successful login creates a
Supabase user; later logins return to the same linked identity. The UI therefore
uses **Continue with GitHub** for both sign-in and account creation.

## Email fallback

`FINALTAB_TEAM_EMAIL_AUTH_ENABLED=true` may reveal the existing email/OTP UI for
an operator-confirmed fallback. Keep it false in the public release while using
Supabase default mail, which delivers only to project organization members. The
flag is a UI/delivery gate, not an address allowlist: if public email auth must be
off as a security property, disable the Email provider in Supabase or add
provider-side hooks and authorization rules. Do not claim branded or public
email until custom SMTP or a Send Email Hook and verified sender domain pass a
live probe.

## Release probe

- Start from `/auth?next=%2Fapp`, complete GitHub in the same browser, and verify
  the final URL is `/auth/complete?next=%2Fapp` before entering `/app`.
- Repeat with two overlapping GitHub flows and confirm each callback uses its
  matching `sb_flow_id` without consuming the other code.
- Confirm cancel/deny, expired code, duplicate code, invalid `sb_flow_id`, and an
  external `next` all fail safely without reflecting provider details.
- Confirm `/api/session` returns the GitHub-linked Supabase UUID and that two
  separate GitHub identities cannot read each other's RLS-protected tabs.
- If an email identity already exists, test Supabase's configured identity
  linking policy explicitly; never assume matching email text alone links users.

Primary references:

- [Supabase Login with GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Supabase SSR PKCE](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase `signInWithOAuth`](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)
