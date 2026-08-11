# Submission status — source of truth

**Measured:** 2026-08-11

**Canonical copy:** [../submission.md](../submission.md)

**Pre-submit gate:** [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md)

This is the operational source of truth for the KeeperHub Agents Onchain
submission. Historical V1 evidence is preserved, but it does not prove the
current V2 contract, MCP flow, settlement, or video.

## Verdict

**V2 deployment is proven; V2 settlement and the submission package are not
complete yet.** `FinalTabBatchSettlementV2` was deployed through KeeperHub on
Base Sepolia and its creation and runtime source are an exact Sourcify match.
No V2 testnet-USDC settlement receipt, final V2 video, public video URL, or
DoraHacks confirmation is currently retained. Those remain blocking.

## Current V2 proof

| Artifact | State | Evidence |
|---|---|---|
| Public repository | `READY` | <https://github.com/vaibhav4046/finaltab> |
| MIT license and contribution/security docs | `READY` | Repository root |
| Live product URL | `DEPLOYED; REVERIFY AFTER V2 CONFIG` | <https://finaltab.vercel.app> |
| V2 contract | `LIVE_PROVEN` | [`0x7b58791c…cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| KeeperHub V2 deployment | `LIVE_PROVEN` | execution `xasakw5nfxkh2s0fh4stn`; [tx `0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f); block `45321107`; verified receipt |
| V2 source | `LIVE_PROVEN` | Sourcify exact creation/runtime match, match ID `43497805`; [repository entry](https://repo.sourcify.dev/84532/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| Authenticated MCP V2 source | `IMPLEMENTED; LIVE RECHECK REQUIRED` | Scoped bearer authentication, external-wallet signatures, wallet-signed broadcast approval, independent receipt verification |
| V2 USDC settlement | `BLOCKING — PENDING PROOF` | No retained V2 settlement execution ID, transaction, balance delta, or `SettlementExecuted` proof yet |
| V2 video | `BLOCKING — PENDING RENDER` | No truthful duration, checksum, or public URL yet |
| DoraHacks entry | `BLOCKING — PENDING HUMAN SUBMISSION` | Live page checked 2026-08-11; deadline 2026-08-13 12:00 UTC+2; confirmation not retained |
| KeeperHub onboarding contribution | `PROVEN; ENTRY ROUTE AMBIGUOUS` | [PR #95](https://github.com/KeeperHub/cli/pull/95) was open and not merged when last checked; live Bounties tab currently contradicts the detail-page bounty copy |

The V2 deployment evidence is retained at
[evidence/v2-deployment-2026-08-11T01-08-17-421Z.json](evidence/v2-deployment-2026-08-11T01-08-17-421Z.json).
It proves deployment, bytecode, domain separation, and source matching. It does
**not** prove a V2 USDC settlement.

## MCP V2 truth

The current source registers nine production tools and three `demo_*` tools.
Production requests require a scoped bearer token. The value-moving production
flow is:

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
FINALTab does not hold arbitrary user wallet keys. The fixed Vee/Hem/Ravi tools
are explicitly `demo_*`, testnet-only, and disabled unless
`FINALTAB_ENABLE_DEMO_MONEY_TOOLS=true`; even then, broadcasting requires a
configured human demo approver.

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
The combined 2026-08-11 worktree now measures **284 passing, 1 env-gated live
provider check skipped** (`pnpm test`, exit 0). Re-run this on the submitted
commit and use that retained log as the final count.

## Remaining disclosure

- V2 settlement proof is pending.
- The production V2 MCP endpoint and scopes must be re-probed after deployment
  with secrets redacted.
- Demo money tools are disabled by default and are not the user-wallet product.
- Supabase migrations and production credentials must be checked before any
  persistence or cross-device claim.
- Groq has historical live evidence; other model-provider fallback legs should
  remain described according to their current measured state.
- Sourcify exact matching is proven. BaseScan source verification is not
  claimed unless BaseScan itself reports it.

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

1. Configure and redeploy the web/MCP service for the V2 address and version.
2. Execute one authenticated, external-wallet V2 settlement through KeeperHub.
3. Retain its redacted MCP trace, KeeperHub receipt, independent RPC proof,
   exact indexed V2 plan binding, and participant balance deltas.
4. Render and review the V2 video from that same proof package.
5. Upload the video, record its real public URL and measured metadata, and
   replace every `PENDING` marker.
6. Run clean CI, recheck PR state, submit the required links before the verified
   deadline, and retain confirmation.
