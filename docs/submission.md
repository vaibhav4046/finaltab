# DoraHacks submission copy — submitted and under review

The [DoraHacks BUIDL](https://dorahacks.io/buidl/47656) is submitted and
`Under Review`; its Best Onboarding UX Improvement bounty application is saved.
V2 deployment, one value-moving V2 settlement, the hardened 31-table Supabase
schema, canonical GitHub OAuth, authenticated tab creation, exactly-nine-tool
non-value MCP proof, and the public product film are proven. Durable
spend-reservation controls and sensitive provider variables are configured.
The real microphone/readback lifecycle remains unproven. Current truth lives in
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
| Infrastructure | OpenAPI, discovery metadata, a KeeperHub workflow package, scoped authentication, a shared durable UI/REST/MCP submission journal, fail-closed proof tooling, and a provisioned London Supabase schema make the rail reusable from other clients and agent systems. The hosted baseline, additive, financial-cutover, and owner-select migrations are verified at 31/31 public RLS tables with server-only sensitive mutation RPCs. |

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
path is deployed and source-tested. Supabase provides durable per-user budget
controls fixed at 8 transcription sessions and 20 readbacks per minute through
service-role-only spend reservations, and both provider keys are stored as
sensitive Vercel Production variables. The capability must not be described as
live until its microphone, `Begin`/`Termination`, readback, quota, and text
fallback paths pass a real provider probe.

The product-film narration is separate from browser voice. It was generated
locally with Kokoro. The no-charge ElevenLabs preflight made one quota-check
GET, was denied, made zero synthesis POSTs, and was not retried.

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
project ref `yoavihmldqbkuxinrsih`. The baseline and ordered additive migrations
`20260811052236`, `20260811060000`, `20260811064822`, `20260811073000`, and
`20260811074000`, plus `20260812023200` and `20260812090000`, are applied
remotely, followed by the financial-truth cutover
and `tab_owner_select_returning` repair. Verification found 31/31 public tables
with RLS enabled. Sensitive mutation RPCs, legacy direct financial writes, and
the old quota RPC deny browser roles; `reserve_voice_budget_service` allows only
`service_role`. Advisors report zero error-level findings, with reviewed
RLS/function warnings and the leaked-password-protection warning still present.
The repair closed the owner `INSERT ... RETURNING` RLS edge without weakening
the owner-pinned insert policy. A real authenticated production tab create/read,
owner membership, participant add, and audit record passed. Two-identity
isolation and shared-journal recovery remain separate unclaimed probes.

Supabase Auth is the canonical account/RLS identity. A real canonical GitHub
OAuth flow passed the branded `/auth/complete` page, entered `/app`, survived a
full reload, and exercised the authenticated RLS-backed tab path. Privy is an
optional linked-wallet identity bridge only. The
authenticated dashboard showed the required Custom Authentication feature on a
paid tier, so no billing details were entered and the bridge remains
deliberately disabled. It is exposed as optional/unconfigured in health, hidden
from unconfigured product UI, and does not block Supabase-backed readiness. A
email fallback UI is disabled and inbound delivery remains unproven; a branded
email is not live until a verified sender domain and custom SMTP or Send Email
Hook are configured.

## Links

- Live product: <https://finaltab.vercel.app> — `READY`; deployment `dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs`; commit `039582fc44901d1f436b61a426f1523a936427f9`
- Source: <https://github.com/vaibhav4046/finaltab>
- MCP endpoint: <https://finaltab.vercel.app/api/mcp> — authenticated exactly-nine-tool list plus non-value calculation/preparation live-proven; no submission called
- V2 contract: <https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB>
- V2 deployment transaction: <https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f>
- V2 settlement transaction: <https://sepolia.basescan.org/tx/0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789>
- V2 product video: <https://youtu.be/eXZACnOdt5w> — 90.005s; 3840×2160 at 60 fps; 5,400 H.264 video frames with AAC audio; 35,617,576 bytes; SHA-256 `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69`
- DoraHacks: <https://dorahacks.io/buidl/47656> — submitted and `Under Review`; Best Onboarding UX Improvement bounty application saved

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
- Canonical release: deployment `dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs` serves
  commit `039582fc44901d1f436b61a426f1523a936427f9` and is `READY`.
- Authenticated MCP: production listed exactly nine tools and passed non-value
  calculation and arbitrary-participant V2 preparation. No submission call was
  made; the retained value proof is separately labeled.
- Hybrid voice: code and budget controls are deployed/configured, but the real
  microphone/readback lifecycle remains pending. The verified public 4K/60
  product film uses local Kokoro narration, not a live browser voice lifecycle.
- V2 value-moving rail through KeeperHub: live-proven at execution
  `3hmlqi36zweiwg6fc5o2u`, tx `0x7a6fb760…a789`, block `45327128`, with verified
  dual signatures, receipt, exact V2 event binding, and conserved balances.
- Supabase production infrastructure: baseline/additive/cutover/owner-select
  schema is applied; all 31 public tables have RLS, sensitive mutation RPCs and
  legacy writes deny browser roles, and error-level advisor findings are zero
  with reviewed warnings remaining. GitHub OAuth/reload and authenticated tab creation are
  live-proven. Email fallback is disabled/unproven; two-identity isolation,
  HMAC flow provenance, and shared-journal crash recovery remain unclaimed.
- Privy bridge: optional, code-complete, fail-closed, and deliberately disabled
  under the stop-before-charge constraint; it is not a submission blocker.
- Unified production MCP human-approval trace: pending. The film stops before
  signing, submission, broadcast, or value movement; the retained settlement
  was a separate authorized simulate-then-single-broadcast proof run.
- Final V2 product video and public URL: proven at
  <https://youtu.be/eXZACnOdt5w>.

## Onboarding contribution and bounty status

[KeeperHub/cli PR #95](https://github.com/KeeperHub/cli/pull/95) is open and
unmerged. It adds only fail-closed `--require-verified` behavior. It is a
reusable KeeperHub onboarding contribution and concrete integration finding;
it must not be described as merged or as adding another flag.

The authenticated DoraHacks flow saved the Best Onboarding UX Improvement
bounty application for BUIDL 47656. The BUIDL is submitted and `Under Review`.

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
- Production identity is proven for one canonical GitHub account and one
  authenticated owner tab; no two-user or cross-device inference is made.
- Sourcify exact matching is proven; BaseScan source verification is not
  implied.

## Best Onboarding UX bounty

[KeeperHub/cli PR #95](https://github.com/KeeperHub/cli/pull/95) adds
only `--require-verified` so automated status watching can fail closed. It is
open and unmerged. Never describe it as merged or expand its scope unless the
live PR changes.

## Judging evidence map

| Criterion | Current evidence |
|---|---|
| KeeperHub execution | Verified V2 deployment `xasakw5nfxkh2s0fh4stn` plus value-moving execution `3hmlqi36zweiwg6fc5o2u` |
| Contract integrity | V2 plan binding, dual signatures, replay controls, atomic execution, exact Sourcify match |
| MCP safety | Scoped auth, external-wallet and signed-human-approval boundaries in source/tests, simulate-first flow, independent proof; live broadcast trace still pending |
| Product usefulness | Receipt-to-settlement workflow with deterministic money rules |
| Still required | Real browser microphone/readback lifecycle and a live production MCP human-approval/submission trace; neither is implied by the submitted film |
