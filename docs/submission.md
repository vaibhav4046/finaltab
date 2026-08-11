# DoraHacks submission copy — V2 proof pending

**Do not submit this draft yet.** The V2 deployment is proven, but a V2 USDC
settlement, verified Supabase project, final video, public video URL, and
DoraHacks confirmation are still pending. Current truth lives in
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
| Blockchain, Web3, DeFi, Onchain | An exact-source-matched V2 contract on Base Sepolia, external-wallet EIP-3009 and full-plan consent, atomic testnet-USDC execution, KeeperHub orchestration, and independent event verification. Deployment is proven; a fresh value-moving V2 settlement is still pending. |
| AI Agents, MCP, Autonomous Agents | Nine authenticated production MCP tools let agents allocate, net, prepare, simulate, orchestrate, and verify. Autonomy is bounded: every debtor signs externally and a permitted human wallet signs a short-lived broadcast approval before value can move. |
| Infrastructure | OpenAPI, discovery metadata, a KeeperHub workflow package, scoped authentication, idempotent submission, and fail-closed proof tooling make the settlement rail reusable from other clients and agent systems. Supabase persistence is not claimed until provisioned. |

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

After submission, `settlement_status` re-fetches KeeperHub and independently
checks the Base Sepolia receipt plus the V2 `SettlementExecuted` log's indexed
`settlementId` and `ledgerHash` against the frozen plan. A transaction hash,
`completed` string, or unrelated FINALTab settlement is not proof.

An optional hybrid voice layer keeps the same authorization boundary:
AssemblyAI live transcription can fill the editable allocation instruction,
and ElevenLabs can read back a short confirmation. Voice never allocates,
signs, or submits by itself. Permanent provider keys remain server-side. This
branch is locally verified, but the capability must not be described as live
until Vercel provisions its durable paid-provider quota and the deployed
microphone, `Begin`/`Termination`, and readback paths pass a real provider probe.

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

## Links

- Live product: <https://finaltab.vercel.app> — 13/13 protected release probe passed at main commit `b084497`
- Source: <https://github.com/vaibhav4046/finaltab>
- MCP endpoint: <https://finaltab.vercel.app/api/mcp> — authenticated V2 surface live-probed at `b084497`
- V2 contract: <https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB>
- V2 deployment transaction: <https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f>
- V2 settlement transaction: **PENDING — no proven V2 USDC settlement yet**
- V2 demo video: **PENDING — no rendered or public artifact yet**

## MCP V2 surface

The current source registers nine production tools:

`split_equal`, `split_weighted`, `net_debts`, `allocate_receipt`,
`prepare_receipt_settlement`, `simulate_signed_settlement`,
`create_broadcast_approval_challenge`, `submit_signed_settlement`, and
`settlement_status`.

Three fixed-wallet tools are separately named `demo_get_balances`,
`demo_prepare_settlement`, and `demo_settle_tab`. They are testnet-only and
disabled by default. They are not presented as the production user workflow.

## Evidence state

- V2 deployment through KeeperHub: proven.
- V2 runtime and creation source exact match through Sourcify: proven.
- V2 contract safety properties and MCP flow: 284 checks passed and one
  env-gated live-provider check skipped at main commit `b084497`; both GitHub
  CI jobs were green, the build emitted 24 routes, and Playwright passed 8/8.
- Protected deployment probe: 13/13 passed against both the immutable Vercel
  deployment and `finaltab.vercel.app`, including scoped MCP auth, the exact V2
  address/version, 9 production + 3 gated demo tools, cent-perfect allocation,
  arbitrary-participant plan preparation, proof binding, and fail-closed demo
  money tools.
- Hybrid voice/category branch candidate: 302 checks passed and one env-gated
  live-provider check skipped locally; the build emitted 26 routes and
  Playwright passed 8/8. Nine ElevenLabs narration MP3s decoded successfully,
  and 29 timestamp-derived captions end at 94.53 seconds. Production voice and
  the final video render remain pending.
- Authenticated external-wallet V2 settlement through KeeperHub: pending live
  receipt and independent chain proof.
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

- No V2 USDC settlement is claimed until its execution ID, transaction, event,
  and balance deltas are retained.
- Production MCP requires scoped authentication and external wallet signatures.
- Demo money tools are disabled by default.
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
| KeeperHub execution | Verified V2 deployment execution `xasakw5nfxkh2s0fh4stn` |
| Contract integrity | V2 plan binding, dual signatures, replay controls, atomic execution, exact Sourcify match |
| MCP safety | Scoped auth, external wallets, simulate-first, signed human approval, independent proof |
| Product usefulness | Receipt-to-settlement workflow with deterministic money rules |
| Still required | Live V2 USDC settlement, unified trace/video proof, public video URL, required form links, form confirmation |
