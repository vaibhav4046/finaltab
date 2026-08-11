# KeeperHub Agents Onchain — pre-submission checklist

**Current state:** the one-atomic-unit V2 rail settlement, 29-table RLS Supabase
additive schema, durable voice quotas/spend reservations, and sensitive provider
configuration are proven. The post-promotion cutover, Privy dashboard setup, final deploy/provider probe,
unified nine-tool production MCP capture, final 4K/60 V2 video and public URL,
and human form submission remain
blocking. Main commit `b084497` is the clean baseline: both GitHub CI jobs were
green and the protected production probe passed 13/13. Repeat every release
gate on the final commit.

The live DoraHacks detail page was verified on 2026-08-11. It states all times
are UTC+2 and sets the deadline at **2026-08-13 12:00 UTC+2**
(**10:00 UTC / 11:00 BST**). The form requires a source link, a short demo
video showing the agent executing onchain through KeeperHub, and a transaction
link. Ten finalists are scheduled to pitch August 17–19.

## 1. Repository and CI

Baseline evidence at `b084497`: 284 passing + 1 env-gated skip, 24 generated pages,
Playwright 8/8, and both CI jobs green. The boxes below intentionally remain
open until the final submission commit reproduces that baseline.

- [ ] Submitted commit is pushed and the public repository is readable logged out.
- [ ] MIT `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md` render on GitHub.
- [ ] `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:contracts`,
      `pnpm build`, and `pnpm test:e2e` are green.
- [ ] The final test count is copied from that clean run, not the historical
      V1 `212 passed, 1 skipped` baseline.
- [ ] Final local evidence reproduces 370 passing + 1 provider-gated vision skip
      and a production build that generates 33/33 pages.
- [ ] Added-line, tracked-file, and media secret scans are clean.

## 2. V2 deployment — already proven, recheck links

- [ ] Contract resolves at
      [`0x7b58791c…cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB).
- [ ] KeeperHub deployment execution is `xasakw5nfxkh2s0fh4stn`.
- [ ] Deployment transaction
      [`0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f)
      remains successful at block `45321107`.
- [ ] Retained receipt says `verified: true` and `receiptStatus: "success"`.
- [ ] Sourcify reports exact creation and runtime matches for chain `84532`,
      address `0x7b58791c…cCDB`, match ID `43497805`.
- [ ] Copy says “Sourcify exact match,” not “BaseScan source verified,” unless
      BaseScan has independently changed.

## 3. Production MCP V2

- [ ] Live endpoint is configured with the V2 address and
      `FINALTAB_SETTLEMENT_CONTRACT_VERSION=2`.
- [ ] Anonymous `initialize`, `tools/list`, and tool calls are rejected.
- [ ] A scoped test token can initialize and list tools without appearing in
      logs, screenshots, traces, or video.
- [ ] Production tools expose arbitrary caller participants and external-wallet
      signing; they do not use server-held user keys.
- [ ] The value-moving sequence is
      `allocate_receipt → prepare_receipt_settlement → wallet signatures →
      simulate_signed_settlement → create_broadcast_approval_challenge →
      human personal_sign → submit_signed_settlement → settlement_status`.
- [ ] No production copy or trace uses `confirm: true` as approval.
- [ ] Authenticated `tools/list` returns exactly the nine current production
      tools and no retired fixed-wallet path.
- [ ] UI, `POST /api/settle/execute`, and MCP `submit_signed_settlement` all
      write the same durable submission journal. An accepted retry skips both
      simulation and execution; a prepared retry reuses the stored successful
      simulation and deterministic idempotency key under a bounded approval
      expiry. Fresh first-party submission still requires current database and
      wallet approvals at its final gate.

## 4. V2 settlement rail proof — proven; MCP approval trace still open

- [x] One explicitly authorized V2 settlement moved Base Sepolia testnet USDC
      through KeeperHub: exactly `1` atomic unit (`0.000001` USDC).
- [x] The debtor signed both `ReceiveWithAuthorization` and
      `SettlementConsent`; both recovered the expected signer.
- [ ] Capture the production MCP short-lived human broadcast challenge. The
      retained standalone proof run did not exercise that API boundary.
- [x] The exact payload was simulated immediately before the single broadcast.
- [x] KeeperHub execution ID, transaction hash, block, verified receipt, and
      independent RPC proof all describe the same run.
- [x] The configured V2 contract emitted one exact `SettlementExecuted` log
      bound to the retained settlement ID and ledger hash.
- [x] Before/after balances prove exact debtor debits, creditor payouts,
      conservation, and zero unintended retained balance.
- [x] Sanitized evidence is retained at
      `docs/release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json`
      and referenced by the canonical status document.

Historical V1 settlements at `0xCcf6…7e64`, including execution
`69zzrj7z676u89ce1x76j`, do not satisfy this V2 gate.

## 5. Supabase infrastructure — provisioned; deployed behavior probe open

- [x] Entrant approved organization `xjpjpoxicyvmdfzmrdkk`, London `eu-west-2`,
      and free plan with verified monthly cost `0` before creation.
- [x] `finaltab-production` (`yoavihmldqbkuxinrsih`) is `ACTIVE_HEALTHY`; the four
      baseline migrations and five ordered additive migrations are applied.
- [x] Additive order is `20260811052236`, `20260811060000`, `20260811064822`,
      `20260811073000`, then `20260811074000`.
- [x] Schema verification found 29/29 public tables with RLS. Sensitive new
      mutation RPCs deny `PUBLIC`, `anon`, and `authenticated` and allow
      `service_role`; advisors report no errors, and the unindexed-FK warning is
      cleared.
- [x] Public production configuration points to the verified project; no
      secret/service-role value is exposed in browser configuration.
- [ ] The newer release is deployed and Supabase auth/persistence is probed
      with more than one identity.
- [ ] Cross-device, durable-history, or collaboration copy appears only after
      those behaviors pass a live browser check.

Until the live-behavior boxes pass, FINALTab may describe the provisioned
project and verified additive schema, but not deployed cross-device or provider
behavior.

- [x] Apply additive migrations `20260811052236`, `20260811060000`,
      `20260811064822`, `20260811073000`, and `20260811074000` individually and
      in order; remeasure RLS, RPC grants, advisors, and foreign-key indexes.
- [ ] Deploy and probe the candidate before applying post-promotion migration
      `20260811074500`; then prove legacy direct financial writes and
      `consume_voice_quota(text)` execution are denied.
- [ ] Configure a random server-only `FINALTAB_AGENT_ATTESTATION_SECRET` of at
      least 32 bytes and confirm it never enters logs or browser bundles.
- [ ] Configure an independent random server-only
      `FINALTAB_PROOF_SIGNING_SECRET` of at least 32 bytes; require the health
      probe to report `shareableProof: true` before capturing a public capsule.
- [ ] Verify four-stage ordering, forged-row rejection, stale-review invalidation,
      durable receipt UUID binding, cross-tenant denial, bounded-memory expiry,
      and user deletion before calling the agent control plane live.
- [ ] Configure Privy's production app, Supabase JWKS custom auth, exact allowed
      domain, identity tokens, app ID, and verification key; verify subject pairs
      and prove Privy tokens cannot authorize settlement/MCP routes.
- [ ] Keep branded inbound email unclaimed until a verified sender domain and
      custom SMTP or Send Email Hook are live-probed. The branded return page may
      be shown as implemented.

## 6. Hybrid voice — local candidate, production blocking

- [x] AssemblyAI permanent key remains server-only; the browser receives only
      a short-lived EU streaming redemption credential.
- [x] Live capture uses 50 ms PCM16 frames, validates the applied `Begin`
      configuration, and waits for final `Turn` plus `Termination` on stop.
- [x] ElevenLabs readback is bounded, uncached, text-backed, and truthfully
      labelled as a short buffered browser clip.
- [x] Final local candidate passed 370 checks + 1 provider-gated vision skip,
      and the production build generated 33/33 pages.
- [x] The baseline no-charge per-minute Supabase quota migration is applied remotely.
- [x] The additive daily/monthly spend-reservation migration `20260811064822`
      is applied and its service-role-only database boundary is verified.
- [x] `voice_quota_windows` has RLS enabled and direct anonymous/authenticated
      table grants revoked; `consume_voice_quota(text)` denies anonymous callers
      and is authenticated-only.
- [x] Fixed per-user/minute limits are 8 transcription sessions and 20
      readbacks.
- [x] AssemblyAI and ElevenLabs keys are stored as sensitive Vercel Production
      variables after explicit entrant authorization.
- [ ] A deployed browser probe exercises microphone permission, validated
      provider `Begin`, final-turn shutdown, `Termination`, buffered readback,
      mute, captions, and text fallback without exposing a credential.

## 7. V2 video — blocking

- [ ] Video follows [../demo-storyboard.md](../demo-storyboard.md) and the trace
      contract in [MCP_TRACE_SPEC.md](MCP_TRACE_SPEC.md).
- [ ] Logo, architecture, use case, product workflow, authenticated MCP agent,
      external wallets, approval challenge, KeeperHub execution, and proof are
      legible and narratively connected.
- [ ] The settlement shown is the same V2 run as the published trace.
- [ ] Captions and voiceover are synchronized and understandable independently.
- [ ] No credential, private key, bearer header, cookie, private dashboard, or
      unrelated personal data appears in any frame or audio.
- [ ] Final encoded file is watched end to end.
- [ ] Duration, resolution, frame rate, codecs, byte size, and SHA-256 are
      measured from the final file rather than copied from a plan.
- [ ] Final delivery is measured at 3840×2160 and 60 fps; no 1080p reference
      render is submitted as the master.
- [ ] Public video URL works while logged out.
- [ ] Every `PENDING` video marker is replaced with that real URL and metadata.

The historical 101.64-second V1 and older 92.7-second cut are not V2 media.

## 8. DoraHacks form

- [ ] Correct entrant/team account is authenticated.
- [x] Exact cutoff and timezone recorded from the live form on 2026-08-11:
      2026-08-13 12:00 UTC+2 (10:00 UTC / 11:00 BST).
- [ ] Eligibility and jurisdiction terms are reviewed by the entrant.
- [ ] Required source link resolves logged out.
- [ ] Required short demo video visibly shows the agent executing onchain
      through KeeperHub and resolves logged out.
- [ ] Required V2 settlement transaction link resolves logged out and matches
      the video/trace run.
- [ ] Live app and V2 contract links also resolve logged out.
- [ ] Main-track description matches [../submission.md](../submission.md).
- [ ] PR #95 and its actionable KeeperHub integration feedback are prominent in
      the main BUIDL, regardless of bounty UI state.
- [ ] Authenticated Submit BUIDL flow is checked for a bounty control. The
      detail page advertises a stackable $1,000 onboarding bounty for two
      winners, but the public Bounties tab rendered “No Bounties” on
      2026-08-11; do not assume a selectable checkbox.
- [ ] PR #95 live state is rechecked and described exactly.
- [ ] Final preview contains no `PENDING`, placeholder, or local path.
- [ ] Submission confirmation page/email is retained.

## Current values and pending fields

```text
REPOSITORY_URL=https://github.com/vaibhav4046/finaltab
LIVE_URL=https://finaltab.vercel.app
MCP_URL=https://finaltab.vercel.app/api/mcp
V2_CONTRACT_ADDRESS=0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB
V2_DEPLOYMENT_EXECUTION_ID=xasakw5nfxkh2s0fh4stn
V2_DEPLOYMENT_TX=0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f
V2_DEPLOYMENT_BLOCK=45321107
SOURCIFY_MATCH_ID=43497805
BASELINE_COMMIT=b084497bf883dbf4f1d7123203e9866679d99b67
BASELINE_VERCEL_DEPLOYMENT_ID=dpl_Dh6dTpAMPgRkFsTeNE2qKBK9nAgL
BASELINE_PROTECTED_PROBE=13/13
SUPABASE_PROJECT_REF=yoavihmldqbkuxinrsih
SUPABASE_REGION=eu-west-2
SUPABASE_PLAN=free
SUPABASE_SCHEMA_STATE=ADDITIVE_APPLIED_29_OF_29_PUBLIC_TABLES_RLS_SENSITIVE_MUTATION_RPCS_SERVICE_ROLE_ONLY_NO_ADVISOR_ERRORS_UNINDEXED_FK_WARNING_CLEARED
SUPABASE_APP_PROBE=PENDING_FINAL_DEPLOY
VOICE_DURABLE_QUOTA=PROVISIONED_SUPABASE_AUTHENTICATED_ONLY_8_STT_20_READBACK_PER_USER_PER_MINUTE
VOICE_PROVIDER_SECRETS=CONFIGURED_SENSITIVE_VERCEL_PRODUCTION
VOICE_PRODUCTION_STATE=PENDING_FINAL_DEPLOY_AND_LIVE_PROVIDER_PROBE
V2_SETTLEMENT_EXECUTION_ID=3hmlqi36zweiwg6fc5o2u
V2_SETTLEMENT_TX=0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789
V2_SETTLEMENT_BLOCK=45327128
V2_SETTLEMENT_AMOUNT_ATOMIC=1
V2_SETTLEMENT_ID=0x8b670800d9856a90baa7492adefaf06ae86ac345d053db3dc7f01b065aadb9db
V2_LEDGER_HASH=0x1581eb7f56485ff4d2a684a832fc8d085b9b0e5d8540c85e2d550e8f7b0cb91e
V2_MCP_HUMAN_APPROVAL_TRACE=PENDING
PRIVY_PRODUCTION_STATE=PENDING_DASHBOARD_JWKS_DOMAIN_IDENTITY_TOKEN_VERIFIER_SETUP
BRANDED_INBOUND_EMAIL=PENDING_VERIFIED_DOMAIN_AND_CUSTOM_SMTP_OR_SEND_EMAIL_HOOK
AGENT_CONTROL_MIGRATION=APPLIED
FINANCIAL_TRUTH_CUTOVER=PENDING_POST_PROMOTION
V2_VIDEO_URL=PENDING
ONBOARDING_PR=https://github.com/KeeperHub/cli/pull/95
```
