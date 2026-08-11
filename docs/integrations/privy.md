# Privy identity bridge

## Release status

The integration is code-complete but **optional and deliberately disabled**.
After authenticated dashboard access, Privy's required Custom Authentication
feature was presented on the Scale plan at $499/month, while production
activation also requested payment information. The user authorized no charge,
so no plan was activated and no billing information was entered.

This is not a core release blocker. Supabase Auth and Postgres RLS remain the
production identity system, while explicit external-wallet signatures remain
the V2 settlement authority. `/api/health` therefore evaluates readiness from
the required Supabase-backed capabilities and reports the bridge separately as
`optional.privyIdentityBridge.configured: false` with
`requiredForReadiness: false`. Unconfigured account routes do not mount the
Privy SDK or show a setup-warning panel. `/api/privy/session` remains
fail-closed.

Supabase Auth remains FINALTab's canonical account and Postgres RLS identity. Privy is a custom-JWT subscriber that provisions an embedded wallet identity for the same Supabase `auth.users.id`; a Privy token is never accepted by settlement, tab, vision, MCP, or Supabase Data API authorization. The current ExecutionRail does not use the provisioned Privy wallet for V2 signing: every debtor and broadcaster must still use the explicit external-wallet signature flow.

## Trust boundary

1. `/auth/sign-in` and `/auth/create-account` use GitHub as the primary public Supabase OAuth path. A separately gated email/OTP fallback is hidden by default.
2. `/auth/callback` accepts one PKCE `code` (correlated to its validated `sb_flow_id`) **or** one email `token_hash` plus valid email OTP type, removes the secret from the next URL, and returns to `/auth/complete`.
3. `FinalTabPrivyProvider` passes the live Supabase access JWT to Privy's JWT custom-auth subscriber. It does not call a second Privy login method.
4. `/api/privy/session` requires a current Supabase cookie user plus a Privy access token and Privy identity token. It verifies the Privy issuer, app audience, token-pair subject, and the identity token's `custom_auth.custom_user_id` against the current Supabase UUID.
5. The verified bridge response exposes identity and provisioned-wallet addresses only. It does not mint an API principal or settlement scope, and those addresses are not consumed by ExecutionRail. Value-moving settlement submission still requires the existing explicit app-metadata/scoped-token and exact external-wallet approval controls.

Missing or conflicting configuration, tokens, origins, users, audiences, issuers, subjects, or custom-auth IDs are rejected. There is no local-development or browser-profile authentication fallback.

## Future optional enablement

Complete these steps only after explicit authorization for the required paid
plan, separately for development and production. Stop before entering billing
details or accepting a charge unless that authorization changes.

### Supabase

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Use an asymmetric JWT signing key. Privy cannot retrieve a symmetric Supabase JWT secret from JWKS.
3. Confirm the public JWKS endpoint responds with the active asymmetric key:

   `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`

4. Add the exact deployed callback URL and local development callback to Supabase Auth redirect URLs:

   - `https://<production-domain>/auth/callback`
   - `http://localhost:3017/auth/callback` (development project only)

5. For an SSR token-hash link, customize the relevant email template to target:

   `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`

   Keep the normal Supabase PKCE confirmation URL if using the `code` flow. FINALTab supports both, but rejects a request containing both.

6. Configure a production SMTP provider or Send Email Hook and a verified sender domain. Supabase's default mail delivery is restricted, and new free projects cannot customize auth templates on default SMTP. The branded FINALTab `/auth/complete` return page is implemented; **a branded inbound email is not live or verified** until this mail-provider gate is complete.

### Privy

1. Confirm paid-plan authorization before changing the current disabled state.
2. Create separate development and production Privy apps. Do not reuse the production app ID on localhost.
3. Request/enable Custom Auth Support in **Integrations > Plugins**.
4. Enable JWT-based authentication for the web client and permit client-side custom-auth requests because the React SDK subscribes in the browser.
5. Register the Supabase JWKS URL above and set the JWT user ID claim to `sub`. Supabase's `sub` is the stable user UUID used by RLS.
6. Enable identity tokens. The server bridge needs the signed `custom_auth.custom_user_id` linked account to prove identity consistency.
7. In **Configuration > App settings > Domains**, add only exact controlled HTTPS origins. Add `http://localhost:3017` only to the development app. Never allow generic `https://*.vercel.app` or another shared hosting wildcard.
8. For production, verify a stable base domain and enable Privy HttpOnly cookies. Keep `frame-ancestors 'none'`; FINALTab integrates with KeeperHub over API/webhooks, not iframes.
9. Disable unused login methods, especially SMS for a high-value wallet workflow. Configure a short appropriate session duration and require passkeys/authenticator MFA where supported.
10. Copy the matching app ID, optional web client ID, and ES256 verification public key into the deployment environment. This implementation performs local public-key verification and intentionally does not require or expose a Privy app secret.

## Environment variables

```dotenv
FINALTAB_APP_ORIGIN=https://your-controlled-domain.example
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_PRIVY_CLIENT_ID=optional_web_client_id
NEXT_PUBLIC_PRIVY_API_URL=
PRIVY_VERIFICATION_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

`NEXT_PUBLIC_*` values are browser-visible identifiers. `PRIVY_VERIFICATION_KEY` is server-only even though it is public-key material. Never add `PRIVY_APP_SECRET` to a public variable or this client flow.

## Route matrix

| Route | Access rule | Notes |
| --- | --- | --- |
| `/`, `/developers`, `/open-source`, `/auth`, `/auth/sign-in`, `/auth/create-account` | Public | Account routes show setup/error states without inventing a user. |
| `/auth/callback` | Public one-time return | Exchanges a PKCE code or verifies one token hash; safe same-site continuation only. |
| `/auth/signout` | Same-origin POST | Missing or cross-origin `Origin` is rejected. |
| `/auth/complete`, `/app/**` | Supabase session | Missing config is a setup redirect; missing session is a sign-in redirect. |
| `/api/settle/**`, `/api/vision/**`, `/api/mcp`, agent and voice APIs | Handler-level session/scoped-token authorization | Middleware passes bearer requests through; handlers enforce exact scopes/origin. Privy bearer tokens are not principals here. |
| `/api/privy/session` | Supabase session + verified Privy access/identity pair | Exact Supabase/Privy subject bridge; fail-closed 401/403/503 responses. |
| `/api/health` | Public | Required checks determine `status`; `checks.privyIdentityBridge` and `optional.privyIdentityBridge` truthfully report the non-blocking bridge state. |

## Verification checklist

- Run `pnpm --filter @finaltab/web typecheck`, `pnpm --filter @finaltab/web test`, root `pnpm lint`, and `pnpm --filter @finaltab/web build`.
- Test the required Supabase flow independently: sign-in, create-account, numeric OTP, magic-link return, expired link, sign-out, and browser reload.
- Confirm `/api/privy/session` returns `503 PRIVY_NOT_CONFIGURED` before configuration and never logs either JWT.
- Confirm a Privy token sent to a settlement endpoint receives `401 AUTH_REQUIRED`.
- Confirm unconfigured account routes load no Privy runtime and show no setup-warning UI.
- If future paid enablement is authorized, test wallet creation, mismatched Supabase/Privy accounts, exact allowed domains, server subject pairing, and the complete CSP flow before reporting the optional capability as live.
- After any Privy SDK update, rerun the optional CSP flow because required sources may change.

## Primary documentation

- [Privy JWT provider setup](https://docs.privy.io/authentication/user-authentication/jwt-based-auth/setup)
- [Privy access-token verification](https://docs.privy.io/authentication/user-authentication/access-tokens)
- [Privy identity tokens](https://docs.privy.io/user-management/users/identity-tokens)
- [Privy CSP guidance](https://docs.privy.io/security/implementation-guide/content-security-policy)
- [Privy allowed domains](https://docs.privy.io/recipes/dashboard/allowed-domains)
- [Privy security checklist](https://docs.privy.io/security/implementation-guide/security-checklist)
- [Supabase SSR auth](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Supabase email templates and token hashes](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase asymmetric signing keys](https://supabase.com/docs/guides/auth/signing-keys)
