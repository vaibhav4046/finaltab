# FINALTab

Split a real receipt with plain English, settle it as one atomic onchain batch, and never call it settled until the chain proves it landed.

Built for the KeeperHub "Agents Onchain" hackathon. KeeperHub is the exclusive execution layer: FINALTab never holds a private key for broadcasting, never talks to an RPC node to send transactions, and never invents a transaction state. Every onchain action goes simulate-first through KeeperHub, and the app only shows VERIFIED_SETTLED when KeeperHub returns a chain-verified receipt.

## What it does

1. **Upload a receipt photo.** Groq vision extracts line items into strict JSON: decimal-string amounts, nullable tax/tip/service charge, no floats anywhere.
2. **Say who owes what in plain English.** "Vee had the black daal and half the naan, split the rest evenly." Groq proposes an allocation; the deterministic engine is the only thing that decides. Cent-perfect largest-remainder splitting. If the model's numbers do not reconcile against the receipt, the engine's numbers win.
3. **Netting.** The debt graph collapses to the minimum set of transfers.
4. **Freeze the ledger.** The canonical ledger is hashed (keccak256). Any edit after freezing invalidates every signature, because EIP-3009 nonces derive from the ledger hash.
5. **Sign.** Each debtor signs a USDC `receiveWithAuthorization` (EIP-3009), naming the settlement contract as `to`. Not `transferWithAuthorization` — that variant lets anyone who observes the signature submit it, whereas `receiveWithAuthorization` is enforced by USDC to require `msg.sender == to`, so only the settlement contract can ever redeem it. No approvals, no allowances, no debtor gas.
6. **Settle.** One `executeSettlement` call moves everyone's USDC atomically on Base Sepolia. One bad signature reverts the whole batch.
7. **Verify.** KeeperHub simulates first; a failed simulation is never broadcast. After execution, the flight recorder polls the status endpoint (honoring `X-Poll-Interval-Hint` and `Retry-After`) and marks VERIFIED_SETTLED only when the execution is terminal-successful AND a receipt exists AND `verified === true` AND `receiptStatus === "success"`. A transaction hash alone proves submission, not landing.

## Monorepo layout

| Path | What | Tests |
|------|------|-------|
| `packages/engine` | Integer-minor-unit money engine: validation, largest-remainder split, reconcile, netting, canonical ledger + keccak256 hash, EIP-3009 payload builder | 52 |
| `packages/vision` | Groq receipt extraction + NL allocation proposals (strict JSON schemas, model output never trusted for arithmetic) | 32 (+1 live, env-gated) |
| `packages/keeperhub` | KeeperHub API client: simulate, execute, status polling, fail-closed receipt verification | 32 |
| `packages/keeperhub-flight-recorder` | `kh-proof` CLI: polls an executionId to a terminal verdict with honest exit codes | 7 |
| `contracts` | `FinalTabBatchSettlement.sol` + mock EIP-3009 USDC, Hardhat | 11 |
| `apps/web` | MIDNIGHT RECEIPT LAB: the Next.js app (App Router, Tailwind, Framer Motion) | 66 |
| `supabase/migrations` | Postgres schema for tabs, ledgers, signatures, settlements | not yet applied |
| `docs` | Submission copy, demo storyboard, honest blocker list, CLI PR draft | |

One command runs everything: `pnpm -r --if-present test` yields **200 passing, 1 skipped** — 189 Vitest tests across five packages plus the 11 Hardhat contract tests, since `contracts` is a workspace member too. Measured 2026-08-10 — engine 52, keeperhub 32, vision 32, flight-recorder 7, web 66, contracts 11. The one skipped test is a live-API vision test that runs only when a real `GROQ_API_KEY` is present. No coverage percentage is claimed, because no coverage run has been performed.

## Money rules (non-negotiable)

- All arithmetic in integer minor units. Floats never touch money.
- **USD** 2dp minor units map to USDC 6dp minor units at face value (x10^4). Any other currency is refused for settlement rather than converted: a GBP ledger splits correctly and renders "SPLIT ONLY — NOT SETTLEABLE ONCHAIN". There is no code path that invents an FX rate.
- Splits are largest-remainder: the sum of shares always equals the total, to the cent.
- The LLM proposes; the engine decides. Every proposal is re-reconciled deterministically before it becomes a ledger.

## Honest status

Live: **https://finaltab.vercel.app**

Proven live, through the app's own API routes and the first-flight script:

- Receipt extraction (`/api/vision/extract`) against real Groq.
- NL allocation (`/api/vision/allocate`) against real Groq, reconciled cent-perfect by the engine (model even hallucinated a note about the service charge; the engine split it correctly anyway).
- Real KeeperHub execution on Base Sepolia, end to end: simulate -> execute -> poll -> chain-verified receipt -> **VERIFIED_SETTLED**. Proof: [tx 0x1130...278c](https://sepolia.basescan.org/tx/0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c) (executionId `g0w11wukbk1v0psyditx4`, block 45243955, `verified: true`, `receiptStatus: "success"`).
- CLI contribution shipped upstream: [KeeperHub/cli PR #95](https://github.com/KeeperHub/cli/pull/95) (open, not merged).
- 92.7s demo video recorded in one continuous session against the real app (live Groq extraction and allocation on screen, honest blocked states left in); as-recorded notes in [docs/demo-storyboard.md](docs/demo-storyboard.md).

Blocked, disclosed in [docs/blockers.md](docs/blockers.md):

- The contract **is** deployed at [`0xCcf6b4De…`](https://sepolia.basescan.org/address/0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64) (2259 bytes of code, confirmed by `eth_getCode`) — an earlier revision of this README claimed otherwise and named a predicted address that was never used. Its source is **not yet verified on Basescan**, which is why the settle route must pass the ABI inline.
- The KeeperHub deploy attempt that failed did so because the relayer holds no native ETH: `Insufficient BASE balance. Have: 0.0, Need: 0.000000231.` KeeperHub sponsors transfers, not contract-call gas.
- Supabase persistence is schema-complete but **not applied** (no project credentials yet). The app is stateless per session; nothing is persisted.
- Batch settlement itself (`executeSettlement`) has **never moved USDC on a public chain**. Every account in the demo holds zero USDC and the relayer holds zero native ETH, so Simulate honestly returns "WOULD REVERT — NOT BROADCAST". Full measurement in [docs/release/truth-snapshot.md](docs/release/truth-snapshot.md).
- The Claude and OpenAI legs of the LLM fallback cascade are covered by tests but have never contacted their real APIs; only the Groq leg is live-proven.

Nothing in the UI fakes any of this. Unproven states render as unproven.

## Run it

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill GROQ_API_KEY, KEEPERHUB_API_KEY
pnpm test                             # all package tests
cd contracts && npx hardhat test      # contract tests
cd apps/web && pnpm dev               # http://localhost:3017
```

Secrets are server-only. `GROQ_API_KEY`, `KEEPERHUB_API_KEY` and `SUPABASE_SECRET_KEY` are read exclusively in route handlers and never shipped to the client. `.env*` is git-ignored; `.env.example` carries names only.

## CLI contribution (Best Onboarding UX target)

We also built `--require-verified` and `--timeout` for `kh execute status` in the KeeperHub CLI, so any agent can gate a pipeline on chain-verified receipts instead of a bare `completed` status. PR: https://github.com/KeeperHub/cli/pull/95 (7 new tests, back-compatible). Draft/rationale: [docs/keeperhub-cli-pr-draft.md](docs/keeperhub-cli-pr-draft.md).
