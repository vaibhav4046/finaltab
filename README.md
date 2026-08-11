# FINALTab

Turn a shared receipt into an exact, externally signed USDC settlement, route
the transaction through KeeperHub, and refuse to call it settled until both
KeeperHub and an independent Base Sepolia check prove it landed.

Built for KeeperHub Agents Onchain. Current submission readiness is tracked in
[docs/release/status.md](docs/release/status.md); historical evidence does not
override that file.

## Hackathon category map

| Category | Evidence | Boundary |
|---|---|---|
| **Blockchain** | `FinalTabBatchSettlementV2` is deployed on Base Sepolia through KeeperHub and is an exact Sourcify creation/runtime match. | Deployment is proven; a fresh value-moving V2 run is still pending. |
| **Web3** | Debtors use external wallets for EIP-3009 and full-plan `SettlementConsent` signatures. | The server does not hold arbitrary participant keys. |
| **DeFi** | The V2 rail pulls and pays testnet USDC atomically and fails the entire batch on invalid consent, replay, or imbalance. | No mainnet or fresh V2 value proof is claimed. |
| **AI Agents** | Models interpret receipts; deterministic code performs allocation, netting, hashing, and settlement validation. | A model never chooses or authorizes value movement. |
| **Onchain** | KeeperHub execution is paired with independent Base Sepolia receipt and indexed-event checks. | A transaction hash or `completed` string alone is never proof. |
| **MCP** | The authenticated server exposes nine production tools for calculation, preparation, execution safety, and proof. | Three fixed-wallet `demo_*` tools are separately gated and disabled by default. |
| **Autonomous Agents** | Agents can prepare, simulate, orchestrate, and verify a settlement end to end. | Value movement still requires every debtor signature plus a short-lived human broadcast approval. |
| **Infrastructure** | OpenAPI, discovery metadata, a KeeperHub workflow package, scoped MCP auth, idempotent execution, and proof tooling make the rail reusable. | Supabase-backed persistence is not claimed until it is provisioned and verified. |

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

## Hybrid voice — configuration-gated

The settlement workspace includes an optional, text-first voice layer:

- **AssemblyAI live STT** turns browser-microphone speech into an editable
  allocation instruction. The server mints a short-lived EU streaming token;
  the permanent AssemblyAI key never reaches the browser.
- **ElevenLabs readback** generates a short spoken confirmation through a
  bounded server proxy. Text remains visible and editable, and no transcript
  can allocate, sign, or submit value by itself.
- **Demo narration** is a separate nine-scene ElevenLabs-only asset with
  provider character timings driving the caption track.

These source paths are locally tested but are **not claimed live** on the
current `b084497` deployment. Production enablement remains gated on scoped
authentication, server-side provider secrets, a durable paid-provider quota,
and a post-deploy microphone/readback probe. AssemblyAI is not used to narrate
the product video. The full local candidate measures 302 passing checks plus
one env-gated provider check, a 26-route production build, and Playwright 8/8.

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

The release baseline on main commit
[`b084497`](https://github.com/vaibhav4046/finaltab/commit/b084497bf883dbf4f1d7123203e9866679d99b67)
passed **284 checks with 1 env-gated live-provider check skipped**. Both GitHub
CI jobs were green, the production build emitted 24 routes, Playwright passed
8/8 desktop-and-mobile journeys, and a protected release probe passed 13/13
against both the immutable deployment and `finaltab.vercel.app`. This is a
baseline snapshot; rerun the same gates for any newer submission commit.

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
- Provision and verify Supabase before making persistence or cross-device claims.
- Accept the Vercel Upstash Marketplace terms, provision the bounded durable
  voice quota, add both voice-provider secrets server-side, and live-probe the
  hybrid voice path before advertising it as deployed.
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
