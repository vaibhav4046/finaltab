# Submission status — source of truth

**Measured:** 2026-08-11

**Canonical copy:** [../submission.md](../submission.md)

**Pre-submit gate:** [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md)

This is the operational source of truth for the KeeperHub Agents Onchain
submission. Historical V1 evidence is preserved, but it does not prove the
current V2 contract, MCP flow, settlement, or video.

## Verdict

**V2 deployment, a value-moving V2 settlement, and Supabase provisioning are
proven; the submission package is not complete yet.**
`FinalTabBatchSettlementV2` was deployed through KeeperHub on Base Sepolia and
its creation and runtime source are an exact Sourcify match. A separate,
explicitly authorized one-atomic-unit run completed through KeeperHub and was
independently verified on Base Sepolia. `finaltab-production` is active in
London on Supabase's free plan; its four applied migrations produced the
verified 19-table schema baseline. Additive migrations `52236`, `64822`, `73000`,
and `74000` plus the post-promotion `74500` cutover are not yet applied. Main commit `b084497` passed both
GitHub CI jobs and a 13/13 protected release probe against the then-current
immutable Vercel deployment and public alias. The newer application release,
unified nine-tool MCP capture, Privy dashboard configuration, final V2 video,
public video URL, and DoraHacks confirmation are not yet retained. The hybrid
AssemblyAI/ElevenLabs voice path is locally
verified but not deployed. Its Supabase-backed durable quota guard is applied
and both provider keys are stored as sensitive Vercel Production variables;
the deployed provider lifecycle and quota behavior still require a live probe.
Those remaining release steps are blocking.

## Current V2 proof

| Artifact | State | Evidence |
|---|---|---|
| Public repository | `READY` | <https://github.com/vaibhav4046/finaltab> |
| MIT license and contribution/security docs | `READY` | Repository root |
| Live product URL | `LIVE_PROVEN AT b084497` | <https://finaltab.vercel.app>; deployment `dpl_Dh6dTpAMPgRkFsTeNE2qKBK9nAgL`; 13/13 protected probe |
| V2 contract | `LIVE_PROVEN` | [`0x7b58791c…cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| KeeperHub V2 deployment | `LIVE_PROVEN` | execution `xasakw5nfxkh2s0fh4stn`; [tx `0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f); block `45321107`; verified receipt |
| V2 source | `LIVE_PROVEN` | Sourcify exact creation/runtime match, match ID `43497805`; [repository entry](https://repo.sourcify.dev/84532/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| Authenticated MCP V2 surface | `SOURCE/TEST PROVEN; LIVE RECHECK PENDING` | Current source exposes exactly nine scoped production tools with arbitrary participants, external signatures, exact V2 plan binding, and fail-closed proof. The superseded `b084497` deployment passed auth/calculation/plan/proof probes, but does not prove the retired-tool cleanup. |
| Clean release baseline | `PROVEN AT b084497` | 284 passing + 1 env-gated skip; both GitHub CI jobs green; 24 generated pages; Playwright 8/8 |
| Final local candidate | `LOCAL_PROVEN; CI/DEPLOY PENDING` | 370 passing + 1 provider-gated vision skip; production build generated 33/33 pages. No full production/browser/provider claim is inferred. |
| Hybrid voice candidate | `CONFIGURED; DEPLOY/PROBE PENDING` | AssemblyAI temp-token STT + buffered ElevenLabs readback; sensitive provider variables and the baseline per-minute quota are configured; spend-reservation migration and live provider lifecycle probe pending |
| Settlement durability | `SOURCE/TEST PROVEN; MIGRATIONS PENDING` | Fixed four-stage review; first-party Freeze requires a current HMAC-attested run; UI/REST/MCP share a durable submission journal; accepted recovery skips simulation/execute; prepared recovery reuses its stored successful simulation and deterministic idempotency key under a bounded approval expiry |
| Supabase + Privy identity | `SUPABASE BASELINE PROVEN; PRIVY FAIL-CLOSED` | Supabase is canonical RLS identity; sign-in/create-account/callback and branded return page implemented. Privy app/JWKS/domain/identity-token/verifier setup and live subject-pairing remain pending; branded inbound email needs verified-domain SMTP or Send Email Hook. |
| V2 USDC settlement rail | `LIVE_PROVEN` | KeeperHub `3hmlqi36zweiwg6fc5o2u`; [tx `0x7a6fb760…a789`](https://sepolia.basescan.org/tx/0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789); block `45327128`; 1 atomic USDC; exact V2 event binding and balance conservation |
| V2 video | `BLOCKING — PENDING RENDER` | No truthful duration, checksum, or public URL yet |
| Supabase infrastructure | `LIVE_PROVEN BASELINE; MIGRATION/APP PROBE PENDING` | `finaltab-production`, ref `yoavihmldqbkuxinrsih`, London `eu-west-2`, free plan; four applied migrations; 19/19 tables with RLS, 45 policies, no anon table grants, 34/34 FKs indexed; additive `52236`/`64822`/`73000`/`74000` and post-promotion `74500` pending; final deployed behavior not yet probed |
| DoraHacks entry | `BLOCKING — PENDING HUMAN SUBMISSION` | Live page checked 2026-08-11; deadline 2026-08-13 12:00 UTC+2; confirmation not retained |
| KeeperHub onboarding contribution | `PROVEN; ENTRY ROUTE AMBIGUOUS` | [PR #95](https://github.com/KeeperHub/cli/pull/95) was open and not merged when last checked; live Bounties tab currently contradicts the detail-page bounty copy |

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

The old `212 passed, 1 skipped` result is a historical 2026-08-10 V1 baseline.
Main commit
[`b084497`](https://github.com/vaibhav4046/finaltab/commit/b084497bf883dbf4f1d7123203e9866679d99b67)
measured **284 passing, 1 env-gated live-provider check skipped**. Its GitHub
  quality and browser jobs were green, the production build generated 24 pages,
and Playwright passed 8/8 journeys. A protected probe then passed 13/13 on both
the immutable deployment and public alias. Treat this as the last proven
baseline and rerun every gate for a newer submission commit.

The final local candidate measures **370 passing checks with 1 provider-gated
vision check skipped**, and its production build generated **33/33 pages**.
Existing ElevenLabs narration clips and caption timings are provisional review
references and must be regenerated after approved production captures. These are
local candidate facts, not production-provider or final-render claims.

## Remaining disclosure

- The V2 rail is value-proven with a deliberately minimal `0.000001` USDC run;
  the unified production MCP human-approval trace is still pending.
- The production V2 MCP endpoint and scopes passed the redacted protected probe
  at `b084497`; any newer deployment must be re-probed before promotion.
- The current MCP source contains exactly nine production tools; the new live
  deployment and authenticated tool list are not yet re-probed.
- Supabase's four-migration, 19-table baseline is provisioned and
  schema-verified; additive migrations `52236`, `64822`, `73000`, and `74000`
  plus post-promotion cutover `74500` are unapplied and the newer application release
  must still be deployed and live-probed before any cross-device behavior claim.
- Groq has historical live evidence; other model-provider fallback legs should
  remain described according to their current measured state.
- Sourcify exact matching is proven. BaseScan source verification is not
  claimed unless BaseScan itself reports it.
- AssemblyAI and ElevenLabs remain deployment-gated. Their sensitive Production
  variables and Supabase durable quotas are configured, but real
  microphone/readback/quota lifecycle probes must pass before calling hybrid
  voice live.
- Privy remains deliberately unavailable until dashboard/JWKS/domain/identity
  token/verifier configuration and subject-pairing tests pass. Branded inbound
  email remains pending verified-domain SMTP or a Send Email Hook.

## Judge-readiness strategy

KeeperHub's public event brief requires submissions to land real transactions,
not mocks, and explicitly welcomes MCP/CLI integrations. KeeperHub's prior
official hackathon wrap also emphasizes code, README and video review,
production seriousness, tests, reusable MCP surfaces, audit/failure-mode
thinking, and actionable integration feedback. Therefore the V2 deployment
transaction is valuable but the strongest submission still requires a real V2
product settlement, reusable authenticated flow, visible failure boundaries,
and one consistent proof/video package. A polished edit cannot substitute for
those artifacts.

The live DoraHacks detail page advertises a stackable $1,000 onboarding bounty
for two winners, while `/hackathon/agents-onchain/bounties` rendered “No
Bounties” on 2026-08-11. Treat this as a platform contradiction: feature PR #95
prominently in the main BUIDL and verify any bounty control inside the
authenticated Submit BUIDL flow. Do not claim that a bounty checkbox was
selected unless the final form proves it.

## Deadline truth

The live DoraHacks project detail page was inspected on 2026-08-11. It states
that all times are UTC+2 and gives the deadline as **2026-08-13 12:00 UTC+2**,
which is **10:00 UTC / 11:00 BST**. The page header displayed 11:00 in the
browser's BST locale, consistent with that conversion. The form requires a
source link, a short demo video showing the agent executing onchain through
KeeperHub, and a transaction link. Ten finalists are scheduled to pitch from
August 17 through August 19. Do not replace this with a countdown estimate.

## Completion gates

1. Preserve the `b084497` clean CI and 13/13 protected deployment baseline on
   the final submission commit.
2. Preserve the retained V2 settlement manifest and its exact KeeperHub/chain
   identifiers; do not rebroadcast it.
3. Apply and verify additive migrations `52236`, `64822`, `73000`, and `74000`,
   configure server-only secrets, and probe stale-review rejection, tenant
   isolation, cross-channel journaling, and crash recovery. Apply `74500` only
   after promotion, then prove legacy writes and the old quota RPC are denied.
4. Complete and probe the Privy dashboard/JWKS/domain/identity-token/verifier
   configuration; keep branded inbound email unclaimed until SMTP/domain setup.
5. Capture a redacted production MCP trace that references the proven run
   without implying the standalone runner exercised the human approval route.
6. Deploy and live-probe the provisioned Supabase-backed release before
   claiming durable or cross-device behavior.
7. Deploy the Supabase-guarded voice release and retain a real
   microphone/readback/quota lifecycle probe; durable quotas and sensitive
   provider variables are already configured.
8. Capture the real product and nine-tool MCP flow, regenerate ElevenLabs voice
   and captions, then render and review the 3840×2160/60 V2 video.
9. Upload the video, record its real public URL and measured metadata, and
   replace every `PENDING` marker.
10. Recheck PR state, submit the required links before the verified
   deadline, and retain confirmation.
