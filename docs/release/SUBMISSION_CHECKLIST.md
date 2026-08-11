# KeeperHub Agents Onchain — pre-submission checklist

**Current state:** blocked on a proven V2 USDC settlement, final V2 video and
public URL, verified Supabase provisioning, and human form submission. Main
commit `b084497` is the clean baseline: both GitHub CI jobs were green and the
protected production probe passed 13/13. Hybrid voice is also blocked on the
human Upstash Marketplace terms gate and a real provider probe. Repeat every
gate on the final commit.

The live DoraHacks detail page was verified on 2026-08-11. It states all times
are UTC+2 and sets the deadline at **2026-08-13 12:00 UTC+2**
(**10:00 UTC / 11:00 BST**). The form requires a source link, a short demo
video showing the agent executing onchain through KeeperHub, and a transaction
link. Ten finalists are scheduled to pitch August 17–19.

## 1. Repository and CI

Baseline evidence at `b084497`: 284 passing + 1 env-gated skip, 24-route build,
Playwright 8/8, and both CI jobs green. The boxes below intentionally remain
open until the final submission commit reproduces that baseline.

- [ ] Submitted commit is pushed and the public repository is readable logged out.
- [ ] MIT `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md` render on GitHub.
- [ ] `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:contracts`,
      `pnpm build`, and `pnpm test:e2e` are green.
- [ ] The final test count is copied from that clean run, not the historical
      V1 `212 passed, 1 skipped` baseline.
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
- [ ] `demo_get_balances`, `demo_prepare_settlement`, and `demo_settle_tab` are
      disabled by default and clearly labelled testnet fixtures.

## 4. V2 settlement proof — blocking

- [ ] At least one authenticated external-wallet V2 settlement moves Base
      Sepolia testnet USDC through KeeperHub.
- [ ] Debtors signed both `ReceiveWithAuthorization` and `SettlementConsent`.
- [ ] A permitted human wallet signed the short-lived broadcast challenge.
- [ ] The exact payload was simulated immediately before submission.
- [ ] KeeperHub execution ID, transaction hash, block, verified receipt, and
      independent RPC proof all describe the same run.
- [ ] The configured V2 contract emitted the expected `SettlementExecuted` log.
- [ ] Before/after balances prove exact debtor debits, creditor payouts,
      conservation, and zero unintended retained balance.
- [ ] Evidence is retained under `proof-output/v2/<run-id>/` and referenced by
      the canonical status document.

Historical V1 settlements at `0xCcf6…7e64`, including execution
`69zzrj7z676u89ce1x76j`, do not satisfy this V2 gate.

## 5. Supabase persistence — blocking

- [ ] The intended Supabase organization, region, and cost are approved by the
      entrant before a project is created.
- [ ] Migrations are applied to the verified project and row-level security is
      checked with more than one identity.
- [ ] Production secrets stay server-side and public configuration matches the
      deployed project.
- [ ] Cross-device, durable-history, or collaboration copy appears only after
      those behaviors pass a live browser check.

Until this section passes, FINALTab may describe the migration and local draft
behavior, but not production cloud persistence.

## 6. Hybrid voice — local candidate, production blocking

- [x] AssemblyAI permanent key remains server-only; the browser receives only
      a short-lived EU streaming redemption credential.
- [x] Live capture uses 50 ms PCM16 frames, validates the applied `Begin`
      configuration, and waits for final `Turn` plus `Termination` on stop.
- [x] ElevenLabs readback is bounded, uncached, text-backed, and truthfully
      labelled as a short buffered browser clip.
- [x] Local candidate passed 302 checks + 1 env-gated skip, a 26-route build,
      and Playwright 8/8.
- [ ] Entrant accepts the Upstash Marketplace terms at the Vercel-owned link.
- [ ] The prepared free London `finaltab-voice-guard` resource is provisioned
      with auto-upgrade and production pack disabled.
- [ ] Dedicated durable, route-specific voice quotas and global provider
      concurrency guards are implemented and tested against that resource.
- [ ] AssemblyAI and ElevenLabs keys are added only as sensitive Vercel
      Production variables after explicit entrant authorization.
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
SUPABASE_STATE=PENDING
VOICE_DURABLE_QUOTA=PENDING_TERMS_ACCEPTANCE
VOICE_PRODUCTION_STATE=PENDING_PROVIDER_CONFIG_AND_LIVE_PROBE
V2_SETTLEMENT_EXECUTION_ID=PENDING
V2_SETTLEMENT_TX=PENDING
V2_VIDEO_URL=PENDING
ONBOARDING_PR=https://github.com/KeeperHub/cli/pull/95
```
