# Submission status — source of truth

**Measured:** 2026-08-12

**Canonical copy:** [../submission.md](../submission.md)

**Submission record and remaining gates:** [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md)

This is the operational source of truth for the KeeperHub Agents Onchain
submission. Historical V1 evidence is preserved, but it does not prove the
current V2 contract, MCP flow, settlement, or video.

## Verdict

**The canonical product release, V2 rail, GitHub OAuth, non-value MCP surface,
hardened Supabase schema, public film, and DoraHacks submission are proven;
the production browser voice lifecycle is not.**
`FinalTabBatchSettlementV2` was deployed through KeeperHub on Base Sepolia and
its creation and runtime source are an exact Sourcify match. A separate,
explicitly authorized one-atomic-unit run completed through KeeperHub and was
independently verified on Base Sepolia. `finaltab-production` is active in
London on Supabase's free plan. Its baseline/additive migrations, financial
cutover, and owner-select repair produce 31 public tables, all under RLS.
Sensitive mutation RPCs, legacy direct financial writes, and the old voice RPC
deny browser roles. Advisors report zero error-level findings, with reviewed
RLS/function warnings and the leaked-password-protection warning still present.
Canonical deployment `dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs` serves commit
`039582fc44901d1f436b61a426f1523a936427f9` and is `READY`. A real GitHub OAuth round trip,
reload, authenticated tab creation, nine-tool MCP listing, and non-value MCP
calculation/preparation calls passed. Hybrid voice is deployed/configured but
its real microphone/readback lifecycle remains unproven. The verified public
film is live, and DoraHacks BUIDL 47656 is submitted and `Under Review` with its
Best Onboarding UX Improvement bounty application saved.

## Current V2 proof

| Artifact | State | Evidence |
|---|---|---|
| Public repository | `READY` | <https://github.com/vaibhav4046/finaltab> |
| MIT license and contribution/security docs | `READY` | Repository root |
| Live product URL | `LIVE_PROVEN` | <https://finaltab.vercel.app>; deployment `dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs`; commit `039582fc44901d1f436b61a426f1523a936427f9`; state `READY` |
| V2 contract | `LIVE_PROVEN` | [`0x7b58791c…cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| KeeperHub V2 deployment | `LIVE_PROVEN` | execution `xasakw5nfxkh2s0fh4stn`; [tx `0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f); block `45321107`; verified receipt |
| V2 source | `LIVE_PROVEN` | Sourcify exact creation/runtime match, match ID `43497805`; [repository entry](https://repo.sourcify.dev/84532/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| Authenticated MCP V2 surface | `LIVE_PROVEN — NON-VALUE PROBE` | A scoped token initialized and listed exactly nine tools; `split_equal` and arbitrary-participant V2 preparation passed. No submission call was made. |
| Canonical release | `LIVE_PROVEN` | Deployment `dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs` serves commit `039582fc44901d1f436b61a426f1523a936427f9` and is `READY`. |
| Hybrid voice candidate | `DEPLOYED/CONFIG PROVEN; PROVIDER LIFECYCLE PENDING` | AssemblyAI temp-token STT + buffered ElevenLabs readback code is deployed; sensitive provider variables and server-side budget reservations are configured/applied; real microphone/readback lifecycle pending. |
| Settlement durability | `ONCHAIN GUARD LIVE-PROVEN; SOURCE/TEST/SCHEMA PROVEN; JOURNAL APP PROBE PENDING` | Fixed four-stage review; first-party Freeze requires a current HMAC-attested run; UI/REST/MCP share a durable submission journal; accepted recovery skips simulation/execute; prepared recovery reuses its stored successful simulation and deterministic idempotency key under a bounded approval expiry. The **third** duplicate guard — the contract's own `executed` mapping — is live-proven read-only: `pnpm probe:settlement-replay` rebuilds the broadcast calldata for `3hmlqi36zweiwg6fc5o2u`, matches its retained keccak256 byte for byte, and replays it by `eth_call`, which reverts `AlreadyExecuted(0x8b670800…b9db)` at head while the identical bytes do not revert at block `45327127`. The journal's own accepted-replay and prepared-recovery paths remain unproven against a live database; hosted schema presence does not prove them. |
| Supabase identity + optional Privy bridge | `GITHUB LIVE_PROVEN; PRIVY OPTIONAL/DISABLED` | GitHub OAuth, branded return, `/app`, reload, and an authenticated tab create/read passed. Privy remains fail-closed and hidden under the stop-before-charge constraint. Email fallback UI is disabled and delivery unproven. |
| V2 USDC settlement rail | `LIVE_PROVEN` | KeeperHub `3hmlqi36zweiwg6fc5o2u`; [tx `0x7a6fb760…a789`](https://sepolia.basescan.org/tx/0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789); block `45327128`; 1 atomic USDC; exact V2 event binding and balance conservation |
| V2 video | `PUBLIC/VERIFIED` | <https://youtu.be/eXZACnOdt5w>; 90.005s; 3840×2160 at 60 fps; 5,400 H.264 video frames with AAC audio; 35,617,576 bytes; SHA-256 `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69` |
| Supabase infrastructure | `LIVE-PROVEN SCHEMA/CUTOVER/COLLABORATION WRITE` | `finaltab-production`, ref `yoavihmldqbkuxinrsih`, London `eu-west-2`, free plan; baseline/additive/cutover/owner-select migrations applied; 31/31 public tables with RLS; real owner create/read, membership, participant add, and audit passed; zero error-level findings, with reviewed warnings including leaked-password protection remaining. The new narration journal and durable tab-draft tables use RLS with zero policies, so browser access fails closed. |
| DoraHacks entry | `SUBMITTED — UNDER REVIEW` | [BUIDL 47656](https://dorahacks.io/buidl/47656); Best Onboarding UX Improvement bounty application saved |
| KeeperHub onboarding contribution | `OPEN/UNMERGED` | [PR #95](https://github.com/KeeperHub/cli/pull/95) adds only `--require-verified` |

The V2 deployment evidence is retained at
[evidence/v2-deployment-2026-08-11T01-08-17-421Z.json](evidence/v2-deployment-2026-08-11T01-08-17-421Z.json).
It proves deployment, bytecode, domain separation, and source matching. The
separate settlement manifest at
[evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json](evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json)
proves the one-atomic-unit value run. It records KeeperHub simulation and
execution, verified dual signatures, one successful receipt, exact V2 event
binding, independent RPC verification, debtor `-1` / creditor `+1` / contract
`0`, and conservation delta `0`. The run used explicitly authorized disposable
Base Sepolia signer material; it is not a production MCP human-approval trace.

## MCP V2 truth

The current source registers exactly nine production tools. Production requests
require a scoped bearer token. The value-moving production flow is:

```text
allocate_receipt
→ prepare_receipt_settlement
→ debtor wallets sign ReceiveWithAuthorization + SettlementConsent
→ simulate_signed_settlement
→ create_broadcast_approval_challenge
→ a permitted human wallet personal-signs the short-lived challenge
→ submit_signed_settlement
→ settlement_status(executionId, settlementId, ledgerHash)
```

`confirm: true` is a historical V1 convention, not a V2 approval boundary.
FINALTab does not hold arbitrary user wallet keys. Fixed-wallet money tools and
their server-held signer path are absent from the current production source.

The first-party UI, REST execute endpoint, and MCP submit tool converge on one
service-authored durable journal. Accepted replay returns its persisted
execution without another simulation or execute call. Prepared recovery reuses
the stored successful simulation and deterministic KeeperHub idempotency key
under the persisted approval expiry. A fresh first-party attempt still requires
current database participant approvals and rechecks the wallet approval at the
final pre-broadcast gate.

## Historical V1 evidence — preserved, not current

On 2026-08-10, V1 at `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64`
executed real Base Sepolia testnet-USDC settlements. One historical MCP run used
the former seven-tool, fixed-demo-signer flow and `confirm: true`:
execution `69zzrj7z676u89ce1x76j`, tx `0x314189b4…c5eb`, block `45315909`.
Those records remain valid evidence for V1 only. They must not be presented as
proof that V2 has settled USDC or that the current production MCP approval flow
has broadcast successfully.

The historical V1 video measurements (101.64 seconds and an earlier 92.7-second
cut) are also not V2 metadata. The files are not retained here and have no
current public submission URL.

## Test and release truth

The old `212 passed, 1 skipped` and `b084497` results are historical baselines.
The current canonical release is deployment
`dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs` at commit
[`039582fc44901d1f436b61a426f1523a936427f9`](https://github.com/vaibhav4046/finaltab/commit/039582fc44901d1f436b61a426f1523a936427f9).
Vercel reports it `READY`. This snapshot does not infer a current-commit CI or
Playwright result from the prior deployment's evidence.

## Remaining disclosure

- The V2 rail is value-proven with a deliberately minimal `0.000001` USDC run;
  the unified production MCP human-approval trace is still pending.
- The current production MCP endpoint lists exactly nine tools and passed
  authenticated non-value calculation/preparation probes. The filmed MCP flow
  ends before wallet signing, submission, broadcast, or value movement. Its
  read-only retained-settlement lane is explicitly separate.
- Supabase's baseline/additive migrations, financial-truth cutover, and owner
  select repair are applied and schema-verified at 31/31 public RLS tables. A
  real authenticated owner create/read passed; two-identity isolation,
  cross-channel recovery, and cross-device behavior remain unclaimed.
- The **anonymous** authorization boundary is live-proven against production.
  `pnpm probe:anon-authorization` reads the table and function inventory out of
  `supabase/migrations` and calls all 61 surfaces with the same publishable key
  the browser ships: 31/31 tables and 30/30 callable functions answer
  `401 {"code":"42501"}`. The 31st function, `set_updated_at`, returns `trigger`,
  which PostgREST cannot expose at all. Denial lands at the GRANT layer, before
  any policy is consulted. This proves nothing about the `authenticated` role —
  the two-identity claim above stays unclaimed until a real second session runs.
  The run is retained at
  [evidence/anon-authorization-probe.json](evidence/anon-authorization-probe.json),
  which records every surface and its status code. The probe writes no session
  token and refuses to emit an artifact containing the key at all, so the
  evidence can be committed without becoming a second place the key lives.
- Duplicate settlement execution is guarded three times: the durable journal's
  one-intent-per-idempotency-key primary key and `SUBMISSION_ACCEPTANCE_CONFLICT`
  transition, the deterministic KeeperHub idempotency key, and the contract's
  `executed` mapping. Only the third is provable from outside with no credentials
  and no value at risk, and it is: `pnpm probe:settlement-replay` is read-only
  (`eth_call` only — nothing signed, nothing broadcast, no gas) and its retained
  result is `docs/release/evidence/replay-rejection-probe.json`. The first two
  guards are covered by source, unit tests and the migration-invariant test only.
- The journal lock is released before the KeeperHub call, by design: a database
  row lock is not held across a network broadcast. Duplicate prevention across a
  crash-and-retry therefore rests on the deterministic idempotency key and the
  onchain guard, with the journal recording — not gating — that boundary.
- Groq has historical live evidence; other model-provider fallback legs should
  remain described according to their current measured state.
- Sourcify exact matching is proven. BaseScan source verification is not
  claimed unless BaseScan itself reports it.
- AssemblyAI and ElevenLabs are deployed/configured. Their sensitive Production
  variables and Supabase budget controls are present, but a real
  microphone/readback lifecycle must pass before calling hybrid voice live.
  `tests/e2e/voice-lifecycle.spec.ts` is the runnable probe for that gate. It
  skips by default and states its own blocker: minting a capture credential
  requires a real signed-in Supabase session, which cannot be produced without a
  human completing GitHub OAuth or email OTP. See section 7 of
  `docs/release/user-actions.md`.
- Product-film narration was generated locally with Kokoro. The no-charge
  ElevenLabs preflight made one denied quota-check GET, zero synthesis POSTs,
  and no retry.
- Privy remains deliberately unavailable because the required Custom
  Authentication feature needs a paid tier. Health exposes it as optional and
  unconfigured; Supabase Auth/RLS remains canonical. Branded inbound email
  remains pending verified-domain SMTP or a Send Email Hook.

## Judge-readiness strategy

KeeperHub's public event brief requires submissions to land real transactions,
not mocks, and explicitly welcomes MCP/CLI integrations. KeeperHub's prior
official hackathon wrap also emphasizes code, README and video review,
production seriousness, tests, reusable MCP surfaces, audit/failure-mode
thinking, and actionable integration feedback. FINALTab's submission therefore
binds the V2 deployment and separate retained settlement to a reusable
authenticated flow, visible failure boundaries, and one consistent proof/video
package without pretending the film broadcast value.

The authenticated DoraHacks flow saved the Best Onboarding UX Improvement
bounty application for [BUIDL 47656](https://dorahacks.io/buidl/47656). The
BUIDL is submitted and `Under Review`. KeeperHub CLI PR #95 remains open and
unmerged and adds only `--require-verified`.

## Deadline truth

The live DoraHacks project detail page was inspected on 2026-08-11. It states
that all times are UTC+2 and gives the deadline as **2026-08-13 12:00 UTC+2**,
which is **10:00 UTC / 11:00 BST**. The page header displayed 11:00 in the
browser's BST locale, consistent with that conversion. The form requires a
source link, a short demo video showing the agent executing onchain through
KeeperHub, and a transaction link. Ten finalists are scheduled to pitch from
August 17 through August 19. Do not replace this with a countdown estimate.

## Completion gates

1. Preserve canonical deployment `dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs`, commit
   `039582fc44901d1f436b61a426f1523a936427f9`, and Vercel `READY` state.
2. Preserve the retained V2 settlement manifest and its exact KeeperHub/chain
   identifiers; do not rebroadcast it.
3. Preserve the applied cutover and owner-select policy proof. Keep stale-review
   rejection, two-identity isolation, cross-channel journaling, and crash
   recovery labeled source/test/schema-proven until they are separately live.
4. Preserve the film's pre-value MCP trace. Keep a live production MCP
   human-approval/submission trace pending unless it is separately exercised.
5. Retain the canonical GitHub OAuth/reload and collaboration-create evidence;
   do not expand it into an untested two-user or cross-device claim.
6. Keep the production browser microphone/readback lifecycle pending until a
   real provider probe passes; server-side budget controls remain configured.
7. Preserve the public film URL, exact measured media metadata and SHA-256, and
   local Kokoro narration provenance. Do not imply an ElevenLabs synthesis POST.
8. Monitor [BUIDL 47656](https://dorahacks.io/buidl/47656) from its submitted
   `Under Review` state and retain the saved bounty-application state.
9. Keep PR #95 labeled open/unmerged and `--require-verified`-only unless its
   live state changes.
