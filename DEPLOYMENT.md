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

The hosted Supabase project has the baseline plus these seven additive
migrations applied and verified in order:

1. `20260811052236_settlement_agent_control_plane.sql`;
2. `20260811060000_cover_agent_event_composite_fk.sql`;
3. `20260811064822_voice_spend_reservations.sql`;
4. `20260811073000_durable_first_party_settlement_flow.sql`;
5. `20260811074000_durable_submission_intents.sql`;
6. `20260812023200_v3_narration_generation_journal.sql`; and
7. `20260812090000_durable_prefreeze_tab_drafts.sql`.

The resulting hosted schema has 31/31 public tables under RLS. The new
`finaltab_v3_narration_generations` and `tab_drafts` tables have zero policies,
so browser access fails closed. Every sensitive
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

Canonical deployment `dpl_FWLzoyni3SExLtnQ2gLPJu8PjTKb` at commit `47a1ff248495`
is `READY` and was promoted onto `finaltab.vercel.app` on 2026-08-14. Promotion
was verified against the live alias rather than inferred from the CLI result:
`/` returns `200` and `/api/health` reports `status: ready` with every required
check `true`. The superseded deployment `dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs` at
commit `039582fc44901d1f436b61a426f1523a936427f9` is the rollback target.

This Vercel project is not linked to the GitHub repository, so a merge to `main`
does not deploy anything. Release the current commit explicitly:

```bash
vercel deploy --prod --skip-domain --yes   # build with production env, alias untouched
vercel promote <deployment-url>            # move the alias only after the build is READY
```

Do not infer a current-commit CI or Playwright result from a prior deployment. Retained
evidence separately proves the canonical GitHub OAuth/reload and one-owner tab
path. The public film's scoped MCP client initializes, lists exactly nine tools,
allocates and prepares the receipt, creates an approval challenge, and then
stops before signing, submission, broadcast, or value movement.

No MCP value submission was called during the filmed release probe. First-party stale
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

Do not rebroadcast that run. The public film shows this pre-value MCP sequence:

```text
initialize
→ tools/list (exactly nine tools)
→ allocate_receipt
→ prepare_receipt_settlement
→ create_broadcast_approval_challenge
→ HARD STOP
```

It performs no wallet signing, `submit_signed_settlement` call, broadcast, or
value movement. The separate read-only lane references the retained KeeperHub
execution/receipt, independent Base Sepolia receipt, V2 event, and exact balance
deltas. That proof run used an explicitly authorized
simulate-then-single-broadcast runner; it did not exercise the production MCP
human broadcast challenge. A live production MCP value-path probe therefore
remains pending.

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

## Video and submission — complete, review pending

The verified public film is <https://youtu.be/eXZACnOdt5w>: 90.005s,
3840×2160 at 60 fps, 5,400 H.264 video frames with AAC audio, 35,617,576 bytes,
SHA-256 `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69`.
Narration was generated locally with Kokoro. The no-charge ElevenLabs preflight
made one denied quota-check GET, zero synthesis POSTs, and no retry. This does
not prove the production browser microphone/readback lifecycle.

[DoraHacks BUIDL 47656](https://dorahacks.io/buidl/47656) is submitted and
`Under Review`; its Best Onboarding UX Improvement bounty application is saved.
[KeeperHub CLI PR #95](https://github.com/KeeperHub/cli/pull/95) is open and
unmerged and adds only `--require-verified`.

## Historical V1 note

The legacy V1 contract `0xCcf6…7e64`, fixed demo signers, seven-tool MCP flow,
`confirm: true`, and 2026-08-10 settlements are preserved as historical
evidence only. Do not copy them into V2 deployment or settlement fields.
