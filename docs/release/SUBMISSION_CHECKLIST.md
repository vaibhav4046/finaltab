# KeeperHub Agents Onchain — submission record and remaining gates

**Current state:** the one-atomic-unit V2 rail settlement, 31-table RLS Supabase
schema/cutover, canonical GitHub OAuth, authenticated tab creation, durable
voice budget controls, sensitive provider configuration, and exactly-nine-tool
non-value MCP probe are proven. The verified 4K/60 product film is public, and
[DoraHacks BUIDL 47656](https://dorahacks.io/buidl/47656) is submitted and
`Under Review`; its Best Onboarding UX Improvement bounty application is saved.
The real browser voice-provider lifecycle remains unproven. Deployment
`dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs` at commit
`039582fc44901d1f436b61a426f1523a936427f9` is `READY`.

The live DoraHacks detail page was verified on 2026-08-11. It states all times
are UTC+2 and sets the deadline at **2026-08-13 12:00 UTC+2**
(**10:00 UTC / 11:00 BST**). The form requires a source link, a short demo
video showing the agent executing onchain through KeeperHub, and a transaction
link. Ten finalists are scheduled to pitch August 17–19.

**Elapsed-deadline note (2026-08-14).** That cutoff has passed. The submission
was recorded below as made and `Under Review` on 2026-08-11, inside the window;
that status is not re-readable from the logged-out BUIDL page, so confirm it
signed in. The August 17–19 pitch window is still ahead. Full note in
[status.md](status.md).

## 1. Repository and CI

Canonical release evidence: deployment `dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs`
at commit `039582fc44901d1f436b61a426f1523a936427f9` is `READY`. The boxes below
remain open where a current-commit clean-checkout result is not recorded.

- [ ] Submitted commit is pushed and the public repository is readable logged out.
- [ ] MIT `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md` render on GitHub.
- [ ] `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:contracts`,
      `pnpm build`, and `pnpm test:e2e` are green.
- [ ] The final test count is copied from that clean run, not the historical
      V1 `212 passed, 1 skipped` baseline.
- [ ] Final local totals and generated-page count are copied from the last clean
      post-video run rather than a pre-deploy working-tree snapshot.
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
- [ ] Blockscout reports `is_verified: true` and `is_fully_verified: true` for
      the same address on chain `84532`, verified `2026-08-14T00:24:16Z`
      through the Verifier Alliance route. Read those fields, not
      `is_verified_via_sourcify` — that one is `false` because the
      verification did not arrive through Sourcify's ingest, and a
      Sourcify-only query therefore reads as unverified. Capture:
      [evidence/blockscout-verification.json](evidence/blockscout-verification.json).
- [ ] Copy says “Sourcify exact match” and “Blockscout verified source,” and
      never “BaseScan source verified.” BaseScan verification was never
      submitted and cannot be re-checked here: the Etherscan V2 API answers
      `Missing/Invalid API Key` without a key.

## 3. Production MCP V2

- [x] Live endpoint is configured with the V2 address and
      `FINALTAB_SETTLEMENT_CONTRACT_VERSION=2`.
- [ ] Anonymous `initialize`, `tools/list`, and tool calls are rejected.
- [x] A scoped test token initialized and listed tools without appearing in
      logs, screenshots, traces, or video.
- [x] Production preparation exposes arbitrary caller participants and
      external-wallet
      signing; they do not use server-held user keys.
- [ ] The value-moving sequence is
      `allocate_receipt → prepare_receipt_settlement → wallet signatures →
      simulate_signed_settlement → create_broadcast_approval_challenge →
      human personal_sign → submit_signed_settlement → settlement_status`.
- [x] No production copy or current trace uses `confirm: true` as approval.
- [x] Authenticated `tools/list` returns exactly the nine current production
      tools and no retired fixed-wallet path.
- [x] Authenticated non-value `split_equal` and arbitrary-participant V2
      preparation passed; no submission call was made during this probe.
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

## 5. Supabase infrastructure — deployed; bounded behavior proof

- [x] Entrant approved organization `xjpjpoxicyvmdfzmrdkk`, London `eu-west-2`,
      and free plan with verified monthly cost `0` before creation.
- [x] `finaltab-production` (`yoavihmldqbkuxinrsih`) is `ACTIVE_HEALTHY`; the four
      baseline migrations and seven ordered additive migrations are applied.
- [x] Additive order is `20260811052236`, `20260811060000`, `20260811064822`,
      `20260811073000`, `20260811074000`, `20260812023200`, then `20260812090000`.
- [x] Schema verification found 31/31 public tables with RLS. The new
      `finaltab_v3_narration_generations` and `tab_drafts` tables have zero
      policies and therefore fail closed to browser roles. Sensitive new
      mutation RPCs deny `PUBLIC`, `anon`, and `authenticated` and allow
      `service_role`; advisors report zero error-level findings with reviewed
      warnings remaining, and the unindexed-FK warning is cleared.
- [x] Public production configuration points to the verified project; no
      secret/service-role value is exposed in browser configuration.
- [x] The newer release is deployed; one real GitHub identity passed callback,
      reload, authenticated owner tab create/read, membership, participant add,
      and audit verification.
- [ ] Supabase tenant isolation is live-probed with more than one identity.
- [ ] Cross-device, durable-history, or collaboration copy appears only after
      those behaviors pass a live browser check.

Until the remaining behavior boxes pass, FINALTab may describe the proven
single-owner collaboration path but not two-user, cross-device, or provider
behavior.

- [x] Apply additive migrations `20260811052236`, `20260811060000`,
      `20260811064822`, `20260811073000`, `20260811074000`,
      `20260812023200`, and `20260812090000` individually and in order;
      remeasure RLS, RPC grants, advisors, and foreign-key indexes.
- [x] Post-promotion migration `20260811074500` is applied; legacy direct
      financial writes, `consume_voice_quota(text)`, and browser-role elevated
      schema privileges are denied.
- [x] `tab_owner_select_returning` is applied and a real owner create/read passes
      without weakening the separate owner-pinned insert policy.
- [ ] Configure a random server-only `FINALTAB_AGENT_ATTESTATION_SECRET` of at
      least 32 bytes and confirm it never enters logs or browser bundles.
- [ ] Configure an independent random server-only
      `FINALTAB_PROOF_SIGNING_SECRET` of at least 32 bytes; require the health
      probe to report `shareableProof: true` before capturing a public capsule.
- [ ] Verify four-stage ordering, forged-row rejection, stale-review invalidation,
      durable receipt UUID binding, cross-tenant denial, bounded-memory expiry,
      and user deletion before calling the agent control plane live.
- [x] Keep Privy optional and disabled under the stop-before-charge constraint;
      health must expose `configured: false` with `requiredForReadiness: false`,
      unconfigured UI must stay hidden, and Privy tokens must remain invalid as
      settlement/MCP principals.
- [ ] Keep branded inbound email unclaimed until a verified sender domain and
      custom SMTP or Send Email Hook are live-probed. The branded return page may
      be shown as implemented.

## 6. Hybrid voice — deployed/configured, provider lifecycle blocking

- [x] AssemblyAI permanent key remains server-only; the browser receives only
      a short-lived EU streaming redemption credential.
- [x] Live capture uses 50 ms PCM16 frames, validates the applied `Begin`
      configuration, and waits for final `Turn` plus `Termination` on stop.
- [x] ElevenLabs readback is bounded, uncached, text-backed, and truthfully
      labelled as a short buffered browser clip.
- [x] The baseline no-charge per-minute Supabase quota migration is applied remotely.
- [x] The additive daily/monthly spend-reservation migration `20260811064822`
      is applied and its service-role-only database boundary is verified.
- [x] `voice_quota_windows` has RLS enabled and direct anonymous/authenticated
      table grants revoked; after cutover, the legacy
      `consume_voice_quota(text)` RPC denies authenticated callers too.
- [x] Fixed per-user/minute limits are 8 transcription sessions and 20
      readbacks.
- [x] AssemblyAI and ElevenLabs keys are stored as sensitive Vercel Production
      variables after explicit entrant authorization.
- [x] Product-film narration was generated locally with Kokoro. The no-charge
      ElevenLabs preflight made one denied quota-check GET, zero synthesis
      POSTs, and no retry.
- [ ] A deployed browser probe exercises microphone permission, validated
      provider `Begin`, final-turn shutdown, `Termination`, buffered readback,
      mute, captions, and text fallback without exposing a credential.

## 7. V2 video — public and verified

- [x] Video follows [../demo-storyboard.md](../demo-storyboard.md) and the trace
      contract in [MCP_TRACE_SPEC.md](MCP_TRACE_SPEC.md).
- [x] Logo, architecture, use case, product workflow, authenticated MCP agent,
      approval boundary, and retained proof are legible and narratively
      connected.
- [x] The filmed MCP flow stops before signing, submission, broadcast, or value
      movement. The retained settlement is visibly separate and matches its
      published proof identifiers.
- [x] Captions and voiceover are synchronized and understandable independently.
- [x] No credential, private key, bearer header, cookie, private dashboard, or
      unrelated personal data appears in any frame or audio.
- [x] Final encoded file was decoded and reviewed end to end.
- [x] Duration, resolution, frame rate, codecs, byte size, and SHA-256 are
      measured from the final file rather than copied from a plan.
- [x] Final delivery is 90.005s, 3840×2160 at 60 fps, 5,400 H.264 video frames
      with AAC audio, 35,617,576 bytes, SHA-256
      `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69`;
      no 1080p reference
      render is submitted as the master.
- [x] Public video URL is <https://youtu.be/eXZACnOdt5w>.
- [x] Stale `PENDING` video markers are replaced with the real URL and metadata.

The historical 101.64-second V1 and older 92.7-second cut are not V2 media.

## 8. DoraHacks form

- [x] [BUIDL 47656](https://dorahacks.io/buidl/47656) is submitted and
      `Under Review`.
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
- [x] Best Onboarding UX Improvement bounty application is saved.
- [x] PR #95 is described exactly as open/unmerged and adding only
      `--require-verified`.
- [x] Stale media/submission placeholders are removed. Genuine unproven feature
      boundaries remain explicitly marked pending.
- [x] Submitted/`Under Review` state and public BUIDL URL are retained.

## Current values and pending fields

```text
REPOSITORY_URL=https://github.com/vaibhav4046/finaltab
LIVE_URL=https://finaltab.vercel.app
MCP_URL=https://finaltab.vercel.app/api/mcp
MCP_PRODUCTION_PROBE=EXACTLY_9_TOOLS_NON_VALUE_CALCULATION_AND_PREPARATION_PASSED_NO_SUBMIT
V2_CONTRACT_ADDRESS=0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB
V2_DEPLOYMENT_EXECUTION_ID=xasakw5nfxkh2s0fh4stn
V2_DEPLOYMENT_TX=0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f
V2_DEPLOYMENT_BLOCK=45321107
SOURCIFY_MATCH_ID=43497805
CANONICAL_COMMIT=039582fc44901d1f436b61a426f1523a936427f9
CANONICAL_VERCEL_DEPLOYMENT_ID=dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs
CANONICAL_HEALTH=READY
SUPABASE_PROJECT_REF=yoavihmldqbkuxinrsih
SUPABASE_REGION=eu-west-2
SUPABASE_PLAN=free
SUPABASE_SCHEMA_STATE=BASELINE_ADDITIVE_CUTOVER_OWNER_SELECT_APPLIED_29_OF_29_PUBLIC_TABLES_RLS_ZERO_ERROR_LEVEL_ADVISOR_FINDINGS_REVIEWED_WARNINGS_REMAIN
SUPABASE_APP_PROBE=GITHUB_OAUTH_RELOAD_AND_SINGLE_OWNER_TAB_CREATE_READ_PROVEN
GITHUB_OAUTH_PRODUCTION_STATE=CANONICAL_ROUND_TRIP_AND_RELOAD_PROVEN
EMAIL_FALLBACK_PRODUCTION_STATE=DISABLED_DELIVERY_UNPROVEN
VOICE_DURABLE_QUOTA=PROVISIONED_SUPABASE_SERVICE_ROLE_RESERVATIONS_8_STT_20_READBACK_PER_USER_PER_MINUTE
VOICE_PROVIDER_SECRETS=CONFIGURED_SENSITIVE_VERCEL_PRODUCTION
VOICE_PRODUCTION_STATE=DEPLOYED_CONFIGURED_PENDING_LIVE_PROVIDER_PROBE
V2_SETTLEMENT_EXECUTION_ID=3hmlqi36zweiwg6fc5o2u
V2_SETTLEMENT_TX=0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789
V2_SETTLEMENT_BLOCK=45327128
V2_SETTLEMENT_AMOUNT_ATOMIC=1
V2_SETTLEMENT_ID=0x8b670800d9856a90baa7492adefaf06ae86ac345d053db3dc7f01b065aadb9db
V2_LEDGER_HASH=0x1581eb7f56485ff4d2a684a832fc8d085b9b0e5d8540c85e2d550e8f7b0cb91e
V2_MCP_HUMAN_APPROVAL_TRACE=PENDING
PRIVY_PRODUCTION_STATE=OPTIONAL_DISABLED_PAID_CUSTOM_AUTH_NOT_AUTHORIZED
BRANDED_INBOUND_EMAIL=PENDING_VERIFIED_DOMAIN_AND_CUSTOM_SMTP_OR_SEND_EMAIL_HOOK
AGENT_CONTROL_MIGRATION=APPLIED
FINANCIAL_TRUTH_CUTOVER=APPLIED_AND_BROWSER_ROLE_DENIAL_VERIFIED
V2_VIDEO_URL=https://youtu.be/eXZACnOdt5w
V2_VIDEO_DURATION_SECONDS=90.005
V2_VIDEO_RESOLUTION=3840x2160
V2_VIDEO_FPS=60
V2_VIDEO_FRAMES=5400
V2_VIDEO_AUDIO_CODEC=AAC
V2_VIDEO_BYTES=35617576
V2_VIDEO_SHA256=a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69
V2_VIDEO_NARRATION=LOCAL_KOKORO
ELEVENLABS_FILM_PREFLIGHT=ONE_DENIED_QUOTA_GET_ZERO_SYNTHESIS_POSTS_NO_RETRY
DORAHACKS_URL=https://dorahacks.io/buidl/47656
DORAHACKS_STATE=SUBMITTED_UNDER_REVIEW
DORAHACKS_BEST_ONBOARDING_UX_APPLICATION=SAVED
ONBOARDING_PR=https://github.com/KeeperHub/cli/pull/95
ONBOARDING_PR_STATE=OPEN_UNMERGED_REQUIRE_VERIFIED_ONLY
```
