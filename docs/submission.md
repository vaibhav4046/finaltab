# DoraHacks submission copy — final media pending

**Do not submit this draft yet.** V2 deployment, one value-moving V2 settlement,
and the 29-table production Supabase additive schema are proven. Durable minute
quota/spend-reservation controls and sensitive provider variables are also
configured. The post-promotion financial cutover, Privy dashboard
configuration, final deployment/provider probe,
unified nine-tool MCP capture, final video, public video URL, and DoraHacks
confirmation are still pending. Current truth lives in
[release/status.md](release/status.md).

The live DoraHacks project page was inspected on 2026-08-11. Its authoritative
deadline is 2026-08-13 12:00 UTC+2 (10:00 UTC / 11:00 BST). It requires a
source link, a short demo video showing the agent executing onchain through
KeeperHub, and a transaction link. Ten finalists are scheduled to pitch from
August 17 through August 19.

## Title

FINALTab — externally signed receipt settlement through KeeperHub

## One-line pitch

FINALTab turns a shared receipt into a deterministic, wallet-approved USDC
batch and refuses to call it settled until KeeperHub and an independent chain
check prove the V2 transaction landed.

## Categories and claim boundaries

**Blockchain · Web3 · DeFi · AI Agents · Onchain · MCP · Autonomous Agents ·
Infrastructure**

| Category group | What FINALTab actually provides |
|---|---|
| Blockchain, Web3, DeFi, Onchain | An exact-source-matched V2 contract on Base Sepolia, EIP-3009 and full-plan consent, atomic testnet-USDC execution, KeeperHub orchestration, and independent event verification. A deliberately minimal one-atomic-unit V2 run is retained with exact event and balance proof. |
| AI Agents, MCP, Autonomous Agents | Exactly nine authenticated production MCP tools let external agents allocate, net, prepare, simulate, orchestrate, and verify. The first-party workspace adds a fixed, attested four-stage review before Freeze. Autonomy is bounded: every debtor signs externally and a permitted human wallet signs a short-lived broadcast approval before value can move. |
| Infrastructure | OpenAPI, discovery metadata, a KeeperHub workflow package, scoped authentication, a shared durable UI/REST/MCP submission journal, fail-closed proof tooling, and a provisioned London Supabase schema make the rail reusable from other clients and agent systems. The hosted baseline plus five ordered additive migrations are verified at 29/29 public RLS tables with server-only sensitive mutation RPCs; the post-promotion cutover and cross-device release probe remain pending. |

## Description

Expense apps usually stop at “who owes whom.” FINALTab connects receipt
allocation to an atomic Base Sepolia settlement without giving an agent or the
server arbitrary user wallet keys.

Models operate only at the interpretation boundary. Receipt amounts enter an
integer-minor-unit engine; largest-remainder allocation reconciles every line
exactly, and deterministic netting removes redundant IOUs without claiming a
globally minimum transfer count. The ledger and complete debit/payout plan are
canonicalized and hashed before anyone signs.

For each debtor, V2 produces two wallet requests: Circle USDC
`ReceiveWithAuthorization` and FINALTab `SettlementConsent`. The second
signature binds the full ordered plan, including creditors and payouts, to the
V2 contract and chain. The contract pulls and pays atomically; one invalid
authorization, consent, replay, or plan mutation reverts the batch.

The authenticated MCP flow uses caller-supplied participants and external
wallet signatures. It simulates the exact signed transaction through KeeperHub,
then creates a short-lived broadcast challenge bound to the authenticated API
principal, chain, V2 contract, ledger, and plan. A permitted human wallet must
`personal_sign` that challenge before `submit_signed_settlement` can broadcast.
The legacy `confirm: true` flag is not accepted as V2 approval.

First-party UI, REST, and MCP submissions share one service-authored journal.
New work stores the successful exact-call simulation and binding before one
deterministically idempotent KeeperHub execute. A durably accepted retry skips
both simulation and execution; a `prepared` crash-recovery retry reuses the
stored successful simulation and idempotency key while the persisted approval
lease remains bounded. Fresh first-party execution still needs current
database-backed approvals plus a valid wallet approval at the final gate.

After submission, `settlement_status` re-fetches KeeperHub and independently
checks the Base Sepolia receipt plus the V2 `SettlementExecuted` log's indexed
`settlementId` and `ledgerHash` against the frozen plan. A transaction hash,
`completed` string, or unrelated FINALTab settlement is not proof.

In the first-party workspace, a confirmed receipt and reconciled allocation are
reviewed in four fixed stages: extraction validity, allocation arithmetic,
consent risk, and proof preflight. Freeze remains locked until the current input
has an accepted server-attested review; any upstream edit invalidates it. The
associated memory is compact, expiring, user-deletable audit memory. It is never
replayed as policy and cannot modify code, authorization, or prompts.

An optional hybrid voice layer keeps the same authorization boundary:
AssemblyAI live transcription can fill the editable allocation instruction,
and ElevenLabs can read back a short confirmation. Voice never allocates,
signs, or submits by itself. Permanent provider keys remain server-side. This
branch is locally verified. Supabase now provides an authenticated-only durable
quota guard fixed at 8 transcription sessions and 20 readbacks per user per
minute plus service-role-only spend reservations, and both provider keys are stored as sensitive Vercel Production
variables. The capability must not be described as live until the newer release
is deployed and its microphone, `Begin`/`Termination`, readback, quota, and text
fallback paths pass a real provider probe.

## Current V2 deployment proof

`FinalTabBatchSettlementV2` is deployed at
[`0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB).
KeeperHub deployment execution `xasakw5nfxkh2s0fh4stn` landed in
[transaction `0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f)
at block `45321107`, with a verified successful receipt. Sourcify reports exact
creation and runtime matches, match ID `43497805`:
<https://repo.sourcify.dev/84532/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB>.

This deployment transaction created the contract; it did not settle a receipt
or move participant USDC.

## Current V2 value proof

The separate authorized proof run used the V2 contract above and the Circle
Base Sepolia USDC contract. KeeperHub simulation succeeded without a revert,
then exactly one broadcast completed:

| Proof | Value |
|---|---|
| KeeperHub execution | `3hmlqi36zweiwg6fc5o2u` |
| Transaction | [`0x7a6fb760…a789`](https://sepolia.basescan.org/tx/0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789) |
| Block | `45327128` |
| Amount | `1` USDC atomic unit (`0.000001` USDC) |
| Settlement ID | `0x8b670800d9856a90baa7492adefaf06ae86ac345d053db3dc7f01b065aadb9db` |
| Ledger hash | `0x1581eb7f56485ff4d2a684a832fc8d085b9b0e5d8540c85e2d550e8f7b0cb91e` |
| Independent proof | receipt success; one exact `SettlementExecuted`; debtor `-1`, creditor `+1`, contract `0`; conservation delta `0` |

Both the EIP-3009 authorization and V2 full-plan consent recovered the expected
debtor signer. The KeeperHub receipt was verified, and an independent Base
Sepolia RPC check matched the receipt, event, state, and balances. Evidence:
[release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json](release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json).

This run used explicitly authorized disposable Base Sepolia signer material and
a simulate-then-single-broadcast runner. It proves the value-moving V2 rail, not
the production MCP human broadcast-challenge path; the video and trace must keep
that distinction visible.

## Supabase production infrastructure

`finaltab-production` is active in London (`eu-west-2`) on the free plan under
project ref `yoavihmldqbkuxinrsih`. The four baseline migrations plus ordered
additive migrations `20260811052236`, `20260811060000`, `20260811064822`,
`20260811073000`, and `20260811074000` are applied remotely. Verification found
29/29 public tables with RLS enabled. Sensitive new mutation RPCs deny `PUBLIC`,
`anon`, and `authenticated` and allow `service_role`; database advisors report
no errors, and the unindexed-FK warning is cleared. The voice quota table
revokes direct anonymous and authenticated grants; its
`consume_voice_quota(text)` RPC is denied to anonymous callers and available
only to authenticated users. Public deployment
configuration is prepared, but durable cross-device application behavior is
not claimed until the final release is deployed and live-probed. Post-promotion
migration `20260811074500` is not applied and must follow a successful candidate
promotion; legacy-write and old-quota-RPC denial must then be probed.

Supabase Auth is the canonical account/RLS identity. The distinct sign-in and
create-account routes, strict callback, and branded `/auth/complete` page are
implemented. Privy is a linked-wallet identity bridge only and currently fails
closed because its dashboard app, Supabase JWKS custom-auth connection, allowed
domains, identity tokens, app ID, and verification key are not configured. A
branded inbound email is also not live until a verified sender domain and custom
SMTP or Send Email Hook are configured.

## Links

- Live product: <https://finaltab.vercel.app> — 13/13 protected release probe passed at main commit `b084497`
- Source: <https://github.com/vaibhav4046/finaltab>
- MCP endpoint: <https://finaltab.vercel.app/api/mcp> — superseded V2 baseline live-probed at `b084497`; exactly-nine-tool release recheck pending
- V2 contract: <https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB>
- V2 deployment transaction: <https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f>
- V2 settlement transaction: <https://sepolia.basescan.org/tx/0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789>
- V2 product video: **PENDING — no rendered or public artifact yet**

## MCP V2 surface

The current source registers nine production tools:

`split_equal`, `split_weighted`, `net_debts`, `allocate_receipt`,
`prepare_receipt_settlement`, `simulate_signed_settlement`,
`create_broadcast_approval_challenge`, `submit_signed_settlement`, and
`settlement_status`.

No fixed-wallet money tools or server-held participant keys remain in the
current production source.

## Evidence state

- V2 deployment through KeeperHub: proven.
- V2 runtime and creation source exact match through Sourcify: proven.
- V2 contract safety properties and MCP flow: 284 checks passed and one
  env-gated live-provider check skipped at main commit `b084497`; both GitHub
  CI jobs were green, the build generated 24 pages, and Playwright passed 8/8.
- Superseded deployment baseline: 13/13 passed against both the immutable Vercel
  deployment and `finaltab.vercel.app`, including scoped MCP auth, the exact V2
  address/version, cent-perfect allocation, arbitrary-participant plan
  preparation, and proof binding. The current exactly-nine-tool source still
  needs its own deployment probe.
- Final local candidate: 370 checks passed and one provider-gated vision check
  skipped; the production build generated 33/33 pages. The existing nine
  ElevenLabs clips and caption timings are provisional references only.
  Production voice and the final 4K/60 product-film render remain pending.
- V2 value-moving rail through KeeperHub: live-proven at execution
  `3hmlqi36zweiwg6fc5o2u`, tx `0x7a6fb760…a789`, block `45327128`, with verified
  dual signatures, receipt, exact V2 event binding, and conserved balances.
- Supabase production infrastructure: additive schema provisioned and verified;
  all 29 public tables have RLS, sensitive mutation RPCs are service-role-only,
  advisor errors are zero, and the unindexed-FK warning is cleared; email
  auth/signups are enabled with confirmation and the production Site URL plus
  exact `/auth/callback` are configured. Final application deployment and
  cross-device behavior probe remain pending. The post-promotion cutover is
  unapplied; HMAC provenance, tenant isolation,
  shared-journal crash recovery, and legacy-write denial still require probes.
- Privy bridge: code-complete and fail-closed; dashboard/JWKS/domain/identity
  token/verifier configuration and live subject-pairing tests remain pending.
- Unified production MCP human-approval trace: pending; the retained settlement
  was a separately authorized simulate-then-single-broadcast proof run.
- Final V2 product video and public URL: pending.

## Onboarding contribution and bounty ambiguity

[KeeperHub/cli PR #95](https://github.com/KeeperHub/cli/pull/95) adds
fail-closed `--require-verified` behavior and a bounded `--timeout` to execution
status polling. It should be described prominently in the main BUIDL as a
reusable KeeperHub onboarding contribution and concrete integration finding.

On 2026-08-11, the DoraHacks detail page advertised a stackable $1,000
onboarding bounty for two winners, while the public Bounties tab rendered “No
Bounties.” The authenticated Submit BUIDL flow must therefore be checked; this
draft does not claim that a separate bounty entry or checkbox exists.

## Historical V1 evidence

V1 at `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` executed real
Base Sepolia testnet-USDC settlements on 2026-08-10. The historical MCP run
used fixed demo signers, seven former tools, and `confirm: true` (execution
`69zzrj7z676u89ce1x76j`, tx `0x314189b4…c5eb`). It remains valid V1 evidence,
but it is not proof of the current V2 external-wallet flow.

The 101.64-second V1 video and an older 92.7-second cut are historical and are
not the current deliverable. Neither file or a public URL is retained here.

## Limits disclosed

- The retained one-atomic-unit V2 settlement proves the contract and KeeperHub
  rail, not mainnet readiness or the production MCP human-approval sequence.
- Production MCP requires scoped authentication and external wallet signatures.
- The current source contains exactly nine MCP tools and no fixed-wallet money
  path.
- Persistence and production identity claims must match the final deployed
  Supabase configuration.
- Sourcify exact matching is proven; BaseScan source verification is not
  implied.

## Best Onboarding UX bounty

[KeeperHub/cli PR #95](https://github.com/KeeperHub/cli/pull/95) adds
`--require-verified` and `--timeout` so automated status watching can fail
closed. It was open and not merged when last checked. Recheck the live PR before
submission and never describe it as merged unless GitHub reports that state.

## Judging evidence map

| Criterion | Current evidence |
|---|---|
| KeeperHub execution | Verified V2 deployment `xasakw5nfxkh2s0fh4stn` plus value-moving execution `3hmlqi36zweiwg6fc5o2u` |
| Contract integrity | V2 plan binding, dual signatures, replay controls, atomic execution, exact Sourcify match |
| MCP safety | Scoped auth, external-wallet and signed-human-approval boundaries in source/tests, simulate-first flow, independent proof; live broadcast trace still pending |
| Product usefulness | Receipt-to-settlement workflow with deterministic money rules |
| Still required | Final deployment/probe, unified MCP capture, final video/public URL, required form links, form confirmation |
