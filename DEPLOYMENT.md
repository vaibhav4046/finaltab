# FINALTab V2 deployment and release runbook

## Proven contract deployment

`FinalTabBatchSettlementV2` is already deployed on Base Sepolia. Do not deploy
another contract merely to fill a configuration field.

| Field | Proven value |
|---|---|
| Contract | `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB` |
| KeeperHub execution | `xasakw5nfxkh2s0fh4stn` |
| Transaction | `0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f` |
| Block | `45321107` |
| Source | Sourcify exact creation/runtime match `43497805` |
| Evidence | `docs/release/evidence/v2-deployment-2026-08-11T01-08-17-421Z.json` |

## Web and MCP configuration

Set public protocol values exactly:

```dotenv
NEXT_PUBLIC_SETTLEMENT_CONTRACT=0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB
FINALTAB_SETTLEMENT_CONTRACT_VERSION=2
```

Supply `KEEPERHUB_API_KEY`, provider keys, Supabase credentials (including the
server-only `SUPABASE_SECRET_KEY` used for trusted financial and paid-voice RPCs),
`FINALTAB_API_TOKENS_JSON`, `FINALTAB_AGENT_ATTESTATION_SECRET`, and
`FINALTAB_PROOF_SIGNING_SECRET` only through server-side secret storage. Store
only FINALTab token SHA-256 digests. Both signing values must be independently
generated with at least 32 random bytes and must never use a `NEXT_PUBLIC_`
prefix. The current production source has exactly nine MCP tools and no
fixed-wallet money path.

GitHub is the primary public sign-in through Supabase SSR PKCE. Configure the
GitHub OAuth credentials in Supabase, keep the production redirect on the exact
`/auth/callback` path (including the reserved `sb_flow_id` and normalized `next`
query), then set the server-only `FINALTAB_GITHUB_OAUTH_ENABLED=true`. The
canonical release has completed a real same-device OAuth round trip, branded
return, `/app` entry, reload, and authenticated RLS-backed tab create/read.
Keep `FINALTAB_TEAM_EMAIL_AUTH_ENABLED=false`
unless the operator has separately verified email delivery. That second flag is
only a UI gate, not an address allowlist. See
[`docs/integrations/github-auth.md`](docs/integrations/github-auth.md).

The hosted Supabase project has the baseline plus these five additive
migrations applied and verified in order:

1. `20260811052236_settlement_agent_control_plane.sql`;
2. `20260811060000_cover_agent_event_composite_fk.sql`;
3. `20260811064822_voice_spend_reservations.sql`;
4. `20260811073000_durable_first_party_settlement_flow.sql`; and
5. `20260811074000_durable_submission_intents.sql`.

The resulting hosted schema has 29/29 public tables under RLS. Every sensitive
new mutation RPC denies `PUBLIC`, `anon`, and `authenticated` and allows only
`service_role`; database advisors report zero error-level findings with
reviewed warnings remaining, and the additive
agent-event composite foreign-key migration clears the remaining unindexed-FK
warning. Do not reapply files or run a blind schema push: hosted migration
timestamps can differ from local filenames. The promoted release is followed by
the applied `20260811074500_financial_truth_post_promotion_cutover.sql` and
`tab_owner_select_returning` repair. The cutover revokes legacy direct financial
writes, the old request-count-only voice RPC, and browser-role `TRUNCATE`,
`REFERENCES`, `TRIGGER`, and `MAINTAIN` privileges in `public`. The repair lets a
new owner read `INSERT ... RETURNING` without weakening the separate owner-pinned
insert policy. Database advisors have zero error-level findings; reviewed
RLS/function warnings and the leaked-password-protection warning remain.

The `74000` journal is the common durability boundary for first-party UI, REST,
and MCP value submission. A recorded `accepted` retry must return its execution
without simulation or execution. A `prepared` retry must reuse the persisted
successful simulation and deterministic KeeperHub idempotency key under the
bounded approval expiry. New first-party work must still pass its current
database approval check and wallet approval immediately before broadcast.

Canonical deployment `dpl_EYEXUVqto8UDcUqoqWKcE1Ui1kPa` at commit
`2d808c7a589385e2f8494189978da64d982fb0cc` has completed these release checks:

1. `/api/health` reports `ready` and discovery reports the V2 address;
2. a scoped redacted token initializes and lists exactly nine MCP tools;
3. non-value `split_equal` and arbitrary-participant V2 preparation calls pass;
4. canonical Playwright passes 14/14 desktop-and-mobile journeys;
5. GitHub OAuth returns through the branded page to `/app` and survives reload;
6. an authenticated production tab create/read, owner membership, participant
   add, and audit record pass after the owner-select repair.

No MCP value submission was called during that release probe. First-party stale
review rejection, cross-channel journal recovery, two-identity isolation, and a
real voice-provider lifecycle remain distinct probes rather than inferred
successes.

Privy is an optional enhancement and is deliberately disabled under the
stop-before-charge constraint because the required custom-auth feature is on a
paid tier. Missing or partial configuration stays fail-closed, does not block
core health readiness, and does not mount the Privy runtime or setup-warning UI.
Future enablement still requires its production app, Supabase JWKS custom-auth
connection, exact allowed domain, identity tokens, app ID, verification key,
and a live subject-pair probe. The branded `/auth/complete` return page is ready;
branded inbound email additionally needs custom SMTP or a Send Email Hook backed
by a verified sender domain.

## Proven V2 live settlement

Deployment proof is not settlement proof. A separate, explicitly authorized
Base Sepolia V2 proof has now closed the value-moving rail gate:

| Field | Proven value |
|---|---|
| KeeperHub execution | `3hmlqi36zweiwg6fc5o2u` |
| Transaction | `0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789` |
| Block | `45327128` |
| Amount | `1` USDC atomic unit (`0.000001` USDC) |
| Result | verified receipt, exact V2 event binding, debtor `-1`, creditor `+1`, contract `0`, conservation delta `0` |
| Evidence | `docs/release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json` |

Do not rebroadcast that run. For the final production MCP capture, exercise the
non-destructive status/proof surfaces against its retained identifiers and show
the product authorization sequence accurately:

```text
allocate_receipt
→ prepare_receipt_settlement
→ debtor wallets sign both typed-data payloads
→ simulate_signed_settlement
→ create_broadcast_approval_challenge
→ permitted human wallet personal_sign
→ submit_signed_settlement
→ settlement_status
```

Retain the redacted trace alongside the existing KeeperHub execution/receipt,
independent Base Sepolia receipt, V2 event, and exact balance deltas. The proof
run used an explicitly authorized simulate-then-single-broadcast runner; do not
imply it exercised the production MCP human broadcast challenge. Follow
`docs/release/MCP_TRACE_SPEC.md` and keep that boundary visible.

## Verification commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts
pnpm build
pnpm test:e2e
```

Record the fresh results from the final commit. Historical V1 counts and video
metadata are not current release evidence.

## Video and submission — pending human actions

Render the final video only from the proven V2 settlement package. Measure its
actual metadata and SHA-256, upload it to a URL that opens logged out, update
the canonical release docs, and submit once before 2026-08-13 12:00 UTC+2
(10:00 UTC / 11:00 BST). The live form was checked on 2026-08-11 and requires
a source link, a short video showing the agent executing onchain through
KeeperHub, and a transaction link. No current public video URL is claimed.

## Historical V1 note

The legacy V1 contract `0xCcf6…7e64`, fixed demo signers, seven-tool MCP flow,
`confirm: true`, and 2026-08-10 settlements are preserved as historical
evidence only. Do not copy them into V2 deployment or settlement fields.
