# FINALTab

Split a real receipt with plain English, settle it as one atomic onchain batch, and never call it settled until the chain proves it landed.

Built for the KeeperHub "Agents Onchain" hackathon. KeeperHub is the exclusive execution layer: FINALTab never holds a private key for broadcasting, never talks to an RPC node to send transactions, and never invents a transaction state. Every onchain action goes simulate-first through KeeperHub, and the app only shows VERIFIED_SETTLED when KeeperHub returns a chain-verified receipt.

## What it does

1. **Upload a receipt photo.** Groq vision extracts line items into strict JSON: decimal-string amounts, nullable tax/tip/service charge, no floats anywhere.
2. **Say who owes what in plain English.** "Vee had the black daal and half the naan, split the rest evenly." Groq proposes an allocation; the deterministic engine is the only thing that decides. Cent-perfect largest-remainder splitting. If the model's numbers do not reconcile against the receipt, the engine's numbers win.
3. **Netting.** The debt graph collapses to the minimum set of transfers.
4. **Freeze the ledger.** The canonical ledger is hashed (keccak256). Any edit after freezing invalidates every signature, because EIP-3009 nonces derive from the ledger hash.
5. **Sign.** Each debtor signs a USDC `transferWithAuthorization` (EIP-3009). No approvals, no allowances, no debtor gas.
6. **Settle.** One `executeSettlement` call moves everyone's USDC atomically on Base Sepolia. One bad signature reverts the whole batch.
7. **Verify.** KeeperHub simulates first; a failed simulation is never broadcast. After execution, the flight recorder polls the status endpoint (honoring `X-Poll-Interval-Hint` and `Retry-After`) and marks VERIFIED_SETTLED only when the execution is terminal-successful AND a receipt exists AND `verified === true` AND `receiptStatus === "success"`. A transaction hash alone proves submission, not landing.

## Monorepo layout

| Path | What | Tests |
|------|------|-------|
| `packages/engine` | Integer-minor-unit money engine: validation, largest-remainder split, reconcile, netting, canonical ledger + keccak256 hash, EIP-3009 payload builder | 44 |
| `packages/vision` | Groq receipt extraction + NL allocation proposals (strict JSON schemas, model output never trusted for arithmetic) | 14 (+1 live, env-gated) |
| `packages/keeperhub` | KeeperHub API client: simulate, execute, status polling, fail-closed receipt verification | 32 |
| `packages/keeperhub-flight-recorder` | `kh-proof` CLI: polls an executionId to a terminal verdict with honest exit codes | 7 |
| `contracts` | `FinalTabBatchSettlement.sol` + mock EIP-3009 USDC, Hardhat | 11 |
| `apps/web` | MIDNIGHT RECEIPT LAB: the Next.js app (App Router, Tailwind, Framer Motion) | build-verified |
| `supabase/migrations` | Postgres schema for tabs, ledgers, signatures, settlements | not yet applied |
| `docs` | Submission copy, demo storyboard, honest blocker list, CLI PR draft | |

108 tests pass across the workspace (`pnpm test`), plus the 11 Hardhat contract tests.

## Money rules (non-negotiable)

- All arithmetic in integer minor units. Floats never touch money.
- Fiat 2dp minor units map to USDC 6dp minor units at face value (x10^4).
- Splits are largest-remainder: the sum of shares always equals the total, to the cent.
- The LLM proposes; the engine decides. Every proposal is re-reconciled deterministically before it becomes a ledger.

## Honest status

Live: **https://finaltab.vercel.app**

Proven live, through the app's own API routes and the first-flight script:

- Receipt extraction (`/api/vision/extract`) against real Groq.
- NL allocation (`/api/vision/allocate`) against real Groq, reconciled cent-perfect by the engine (model even hallucinated a note about the service charge; the engine split it correctly anyway).
- Real KeeperHub execution on Base Sepolia, end to end: simulate -> execute -> poll -> chain-verified receipt -> **VERIFIED_SETTLED**. Proof: [tx 0x1130...278c](https://sepolia.basescan.org/tx/0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c) (executionId `g0w11wukbk1v0psyditx4`, block 45243955, `verified: true`, `receiptStatus: "success"`).
- CLI contribution shipped upstream: [KeeperHub/cli PR #95](https://github.com/KeeperHub/cli/pull/95) (open, not merged).

Blocked, disclosed in [docs/blockers.md](docs/blockers.md):

- Contract deploy through KeeperHub + CreateX simulates clean (predicted address `0xEaf9E9d90a080Fa01E7Eb671AFB5B3f0B445F013`) but the org wallet needs 231 gwei of Base Sepolia ETH; KeeperHub sponsors transfers, not contract-call gas.
- Supabase persistence is schema-complete but not applied (no project credentials yet).

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
