# KeeperHub Agents Onchain Hackathon — FINALTab Submission

**Status (measured 2026-08-10):** deployed and live. What is proven is listed as proven; what is not
is listed as not. Per-surface evidence labels: [docs/release/truth-snapshot.md](docs/release/truth-snapshot.md).

The submission copy itself lives in [docs/submission.md](docs/submission.md). This file is the
operational summary.

## Live surfaces

| Surface | State |
|---------|-------|
| App | https://finaltab.vercel.app |
| Settlement contract | `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` on Base Sepolia — 2259 bytes confirmed via `eth_getCode`. Source **not** verified on Basescan. |
| KeeperHub execution — live batch settlement | tx `0x7bf655f3...45c12d`, executionId `dthckv3julum6m5ktmdik`, block 45310631, `verified: true`, `receiptStatus: "success"` — 4.20 + 3.80 USDC pulled via EIP-3009, 8.00 USDC paid out atomically (2026-08-10). Earlier zero-value rail proof: tx `0x1130...278c`, executionId `g0w11wukbk1v0psyditx4`, block 45243955 |
| Receipt extraction + NL allocation | Live against Groq through the app's own API routes |
| Demo video | `proof-output/finaltab-demo.mp4` — 92.7s, 1080p, recorded in one continuous session against the real app, honest blocked states left in |

## Safe EIP-3009 pattern

Each debtor signs `receiveWithAuthorization`, naming the settlement contract as `to`. Deliberately
not `transferWithAuthorization`: USDC enforces `msg.sender == to` on the receive variant, so a
leaked signature is redeemable only by the settlement contract. Nonces derive from the keccak256
ledger hash, so editing the ledger after signing invalidates every signature by construction.

## Tests

Measured 2026-08-10 by running each suite:

```
engine            52 passed
keeperhub         32 passed
vision            32 passed, 1 skipped (needs a live GROQ_API_KEY)
flight-recorder    7 passed
web               66 passed
contracts         11 passing   (cd contracts && npx hardhat test)
------------------------------------------
                 200 passing, 1 skipped
```

No coverage percentage is claimed, because no coverage run has been performed.

## Proven onchain (2026-08-10)

- **`executeSettlement` moved real USDC on Base Sepolia.** Through the production API →
  KeeperHub → contract: 4.20 + 3.80 USDC pulled from two debtors via signed EIP-3009
  authorizations, 8.00 USDC paid to the creditor, one atomic transaction. tx
  `0x7bf655f3f72774839908021039e640b5ac8acaf5462b1376200cbb490045c12d` (block 45310631,
  `verified: true`, `receiptStatus: "success"`), executionId `dthckv3julum6m5ktmdik`.
  Balance deltas exact (+8.00 / −4.20 / −3.80); contract retained zero. Fail-closed run
  report committed at [docs/release/evidence/](docs/release/evidence/). An earlier revision
  of this file said this had never happened — true when written, closed since; the closure
  is documented in [docs/blockers.md](docs/blockers.md).

## Not proven

- **Supabase is not applied.** Schema is written; there are no credentials and nothing is
  persisted. The app is stateless per session.
- **The Claude and OpenAI fallback legs have never contacted their real APIs.** The cascade is
  covered by 12 tests with each SDK mocked at the module boundary; only the Groq leg is live.
- **Real wallet signing is untested end to end.** Demo keys work; the MetaMask
  `eth_signTypedData_v4` path is stubbed.
- **Contract source is not verified on Basescan**, which is why the settle route passes the ABI
  inline.

## Reproduce locally

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill GROQ_API_KEY, KEEPERHUB_API_KEY
pnpm test
cd contracts && npx hardhat test
cd apps/web && pnpm dev               # http://localhost:3017
```

Secrets are server-only and read exclusively in route handlers. `.env*` is git-ignored;
`.env.example` carries names only.

## Remaining actions, all human-only

1. Submit the DoraHacks entry.
2. Upload the video, fill the `[VIDEO_URL]` marker in `docs/submission.md`.
3. Publish the KeeperHub CLI PR from the prepared branch.
4. Rotate the Alchemy key; decide on the testnet deployer key still present in **unreachable**
   local git objects (zero reachable objects contain it, so it does not travel on a clone or
   push). Both reasoned through in [docs/release/user-actions.md](docs/release/user-actions.md).

**Author:** Vaibhav Lalwani · vaibhavlalwani26969@gmail.com
