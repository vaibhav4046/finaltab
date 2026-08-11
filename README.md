# FINALTab

Turn a shared receipt into an exact, externally signed USDC settlement, route
the transaction through KeeperHub, and refuse to call it settled until both
KeeperHub and an independent Base Sepolia check prove it landed.

Built for KeeperHub Agents Onchain. Current submission readiness is tracked in
[docs/release/status.md](docs/release/status.md); historical evidence does not
override that file.

## Product flow

1. **Extract.** A vision model returns structured receipt lines. Model output is
   schema-checked and never trusted for arithmetic.
2. **Allocate.** The engine converts decimal strings to integer minor units and
   applies deterministic largest-remainder allocation so shares reconcile
   exactly.
3. **Net.** The debt graph is reduced deterministically to at most `n-1`
   transfers. FINALTab does not claim that greedy netting is globally minimal.
4. **Freeze.** Canonical ledger and complete V2 debit/payout plan hashes lock the
   state that wallets review.
5. **Consent.** Every debtor's wallet signs Circle USDC
   `ReceiveWithAuthorization` and FINALTab `SettlementConsent`. The server does
   not hold arbitrary user keys.
6. **Simulate.** KeeperHub simulates the exact signed V2 call before any
   broadcast request.
7. **Approve.** A permitted human wallet reviews and EIP-191-signs a short-lived
   challenge bound to the authenticated API principal, chain, V2 contract,
   ledger, and plan.
8. **Execute and verify.** KeeperHub submits one idempotent atomic call.
   `VERIFIED_SETTLED` requires a successful KeeperHub receipt plus an
   independently fetched receipt whose indexed settlementId and ledgerHash match the frozen plan.

## Current V2 deployment

`FinalTabBatchSettlementV2` is live on Base Sepolia:

| Proof | Value |
|---|---|
| Contract | [`0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| KeeperHub execution | `xasakw5nfxkh2s0fh4stn` |
| Deployment transaction | [`0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f) |
| Block | `45321107` |
| KeeperHub receipt | `verified: true`, `receiptStatus: "success"` |
| Source | [Sourcify exact creation/runtime match](https://repo.sourcify.dev/84532/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB), match ID `43497805` |

Retained manifest:
[docs/release/evidence/v2-deployment-2026-08-11T01-08-17-421Z.json](docs/release/evidence/v2-deployment-2026-08-11T01-08-17-421Z.json).

This transaction proves deployment and source matching. A value-moving V2 USDC
settlement is **pending** and is not inferred from the deployment.

## Authenticated MCP V2

Endpoint: `https://finaltab.vercel.app/api/mcp`

Every request requires a scoped bearer token. Store only SHA-256 token digests
in `FINALTAB_API_TOKENS_JSON`; never expose raw tokens in client code, logs,
screenshots, or traces.

The source registers nine production tools:

- calculation: `split_equal`, `split_weighted`, `net_debts`;
- product: `allocate_receipt`, `prepare_receipt_settlement`;
- execution safety: `simulate_signed_settlement`,
  `create_broadcast_approval_challenge`, `submit_signed_settlement`;
- proof: `settlement_status`.

Three fixed-wallet `demo_*` tools are separately labelled, Base Sepolia-only,
and disabled by default. They are not the production user-wallet workflow.
The old `confirm: true` flag is not a V2 authorization mechanism.

Configuration and flow details:
[docs/integrations/mcp.md](docs/integrations/mcp.md).

## Money and security rules

- All money arithmetic uses integer minor units; floats never touch balances.
- USD 2-decimal minor units map to USDC 6-decimal units at face value. Other
  currencies may split but are refused for onchain settlement without an
  explicit conversion source.
- The model proposes; the deterministic engine decides and reconciles.
- `ReceiveWithAuthorization` names the settlement contract as recipient.
- V2 `SettlementConsent` binds the complete ordered debit/payout plan.
- Invalid signature, nonce, expiry, consent, replay, or conservation reverts
  the atomic batch.
- A hash or `completed` status alone is never settlement proof.

## Repository

| Path | Responsibility |
|---|---|
| `packages/engine` | Integer money, allocation, netting, hashes, V2 plan and signature payloads |
| `packages/vision` | Receipt extraction and allocation proposals |
| `packages/keeperhub` | Simulation, execution, polling, idempotency, fail-closed receipt classification |
| `packages/keeperhub-flight-recorder` | `kh-proof` CLI and auditable verdict output |
| `contracts` | V1 history plus `FinalTabBatchSettlementV2` and adversarial tests |
| `apps/web` | Next.js product, authenticated MCP/API surfaces, proof and integration routes |
| `supabase/migrations` | Persistence/auth schema; deployment state must be verified separately |
| `docs/release` | Canonical status, checklist, trace contract, and retained evidence |

## Run and verify

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts
pnpm build
pnpm test:e2e
```

Copy `.env.example` to the web deployment's environment and supply secrets
server-side. The example pins the public V2 address and protocol version. Demo
money tools remain off unless explicitly enabled.

Current combined worktree gate: **284 checks passed, 1 env-gated live-provider
check skipped**. The Playwright suite exercises four journeys on desktop and
mobile; the submitted commit must retain its own clean-run logs.

## Historical V1 evidence

V1 at `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` executed real
Base Sepolia testnet-USDC settlements on 2026-08-10. A historical MCP run used
fixed demo signers, seven former tools, and `settle_tab(confirm: true)`:
execution `69zzrj7z676u89ce1x76j`,
[tx `0x314189b4…c5eb`](https://sepolia.basescan.org/tx/0x314189b472033de62f8aea7603111c141315be390bc834e283e718382261c5eb),
block `45315909`.

Those records remain evidence of V1 behavior only. They do not prove that the
current V2 external-wallet flow has moved USDC. Likewise, the historical
101.64-second video and older 92.7-second cut are not current submission media.

## Current blockers

- Execute and retain one authenticated external-wallet V2 USDC settlement.
- Bind its redacted MCP trace, KeeperHub receipt, exact-plan event/balance
  proof, and video to one run.
- Render, review, upload, and publish the final V2 video URL.
- Run clean combined CI and verify live deployment configuration.
- Submit as a human entrant before 2026-08-13 12:00 UTC+2
  (10:00 UTC / 11:00 BST); retain the confirmation.

## KeeperHub onboarding contribution

[KeeperHub/cli PR #95](https://github.com/KeeperHub/cli/pull/95) adds
`--require-verified` and `--timeout` to fail closed on unverified execution
status. It was open and not merged when last checked; recheck GitHub before
using its state in the final submission. The DoraHacks detail page advertises
an onboarding bounty, but its Bounties tab rendered “No Bounties” on
2026-08-11. Include the contribution in the main BUIDL and verify the
authenticated submit flow instead of assuming a separate bounty selector.
