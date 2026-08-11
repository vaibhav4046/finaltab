# Hybrid voice spend boundary

FINALTab uses AssemblyAI for optional live transcription and ElevenLabs for
optional spoken readback. Both routes require a real Supabase user identity.
Opaque FINALTab API tokens cannot invoke paid voice, and provider keys remain
server-only.

## Request sequence

1. The route authenticates the Supabase cookie session or bearer JWT and checks
   the required application scope and same-origin policy.
2. The route parses its bounded input. The transcription token route accepts no
   body; readback accepts 1–600 trimmed UTF-16 code units.
3. The route calls `reserve_voice_budget(uuid, text, integer)` through the
   server-only Supabase client, passing the exact user ID already verified by
   the route. Ordinary authenticated clients have no execute permission. The
   database atomically locks the project and user counters, checks the
   minute/day/month and concurrency ceilings, and records an immutable
   reservation.
4. Only an allowed reservation can cross the provider boundary. A missing
   migration, malformed database response, unavailable database, or exhausted
   budget returns before any provider request.

AssemblyAI's temporary-token contract supports an explicit maximum session
duration. FINALTab fixes it at 180 seconds and reserves all 180 seconds before
minting. Its non-releasable 240-second concurrency lease covers the 60-second
redemption window plus the full session, so closing a browser cannot create a
second overlapping token. ElevenLabs readback reserves the normalized request's
JavaScript string length before generation; UTF-16 length is conservative for
Unicode code points.

## Hard caps

Caps live in trusted SQL, not request parameters or environment variables.
Changing one requires a reviewed migration.

| Capability | Unit reserved per request | User UTC day | User UTC month | Project UTC day | Project UTC month | Concurrency |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| AssemblyAI transcription | 180 seconds | 720 s | 3,600 s | 3,600 s | 18,000 s | 1/user, 4/project |
| ElevenLabs readback | 1–600 characters | 2,400 | 12,000 | 12,000 | 60,000 | Provider/account limit |

The existing durable fixed-minute limits remain: eight transcription token
requests and twenty readbacks per user per database minute. Denied attempts
count against the minute guard to prevent retry loops; only allowed decisions
increase spend counters.

Reservations intentionally remain charged when a provider rejects or times
out. This conservative rule prevents ambiguous upstream outcomes and retries
from becoming an unmetered spend path. It can under-use the configured budget,
but it cannot overspend it.

## Database security

Migration `20260811064822_voice_spend_reservations.sql` adds three RLS-enabled
tables with no direct policies or grants for `anon` or `authenticated`. The
`SECURITY DEFINER` RPC sets an empty `search_path`, requires the `service_role`
JWT role, validates the explicit route-verified user ID and fixed units, and is
revoked from `public`, `anon`, and `authenticated`. The earlier
request-count-only RPC remains available only during the additive rollout and
is revoked by the post-promotion cutover migration.

The public response exposes only safe operational metadata: the caller's
remaining day/month units, reset times, reserved units, unit type, and effective
transcription concurrency. It does not expose user IDs, reservation IDs, or
precise project-wide remaining budgets.

## Deployment gate

Set `FINALTAB_VOICE_DURABLE_QUOTA=supabase`, configure the server-only
`SUPABASE_SECRET_KEY`, and apply the committed migration before deploying these
routes. Code fails closed before a provider call if any prerequisite is absent.
Applying the migration and making live provider calls are separate release
actions; this document does not claim that either has occurred.

Provider contracts used by this policy:

- [AssemblyAI temporary streaming token](https://www.assemblyai.com/docs/api-reference/streaming-api/generate-streaming-token)
- [ElevenLabs API generation-cost headers](https://elevenlabs.io/docs/api-reference/introduction)
- [Supabase database functions and `SECURITY DEFINER` guidance](https://supabase.com/docs/guides/database/functions)
