# DoraHacks submission copy (draft for your review)

Fill-in markers: `[DEPLOY_URL]`, `[REPO_URL]`, `[VIDEO_URL]`, `[TX_LINK]` stay empty until the real thing exists. Do not submit with placeholders filled by hand-waving.

## Title

FINALTab: receipt to verified onchain settlement, no trust in a model, no trust in a hash

## Tagline (one-liner)

Split a real receipt in plain English, settle it as one atomic USDC batch through KeeperHub, and never see "settled" until the chain proves it landed.

## Description

Group expenses die in the last mile: someone fronts the bill, an app computes splits, and then everyone "will send it later." FINALTab closes the loop onchain, and it is paranoid at every step where money tools usually cut corners.

**The pipeline:**

- **Vision, not typing.** Upload the receipt photo. Groq vision extracts line items into strict JSON with decimal-string amounts. Floats never touch money anywhere in the codebase.
- **English, not spreadsheets.** "Vee had the daal, split the rest evenly." The LLM only PROPOSES an allocation. A deterministic engine re-reconciles every proposal against the receipt with integer minor units and largest-remainder splitting; shares always sum to the total, to the cent. In our live test the model hallucinated a note claiming the service charge was absent; the engine split it correctly anyway. That is the design working, not luck.
- **Netting.** The debt graph collapses to the minimum transfer set before anyone signs.
- **Frozen ledger.** The canonical ledger is keccak256-hashed. EIP-3009 nonces derive from that hash, so editing the ledger after signing invalidates every signature by construction.
- **Gasless for debtors.** Each debtor signs USDC `receiveWithAuthorization` (EIP-3009), naming the settlement contract as `to`. Deliberately not `transferWithAuthorization`: USDC enforces `msg.sender == to` on the receive variant, so a leaked signature is redeemable only by the settlement contract. No approvals, no allowances, no debtor gas.
- **Atomic batch.** `FinalTabBatchSettlement.executeSettlement` moves everyone's USDC in one transaction on Base Sepolia. One bad signature reverts the whole batch. Replay is blocked by settlementId derived from the ledger hash. 11 Hardhat tests cover atomicity, replay, nonce binding, and expiry.
- **KeeperHub is the only execution layer.** Simulate first; a failed simulation is never broadcast. Then execute, then poll status honoring `X-Poll-Interval-Hint` and `Retry-After`. The app shows VERIFIED_SETTLED only when the execution is terminal-successful AND a receipt exists AND `verified === true` AND `receiptStatus === "success"`. A transaction hash proves submission; only a verified receipt proves landing. There is no code path that fakes a transaction state.

**Numbers:** 189 passing workspace tests + 11 Hardhat tests = 200 (measured 2026-08-10, no coverage percentage claimed). Zero-budget stack: Next.js on Vercel free, Supabase free, Groq free tier, KeeperHub.

- Live app: https://finaltab.vercel.app
- Repo: https://github.com/vaibhav4046/finaltab
- Demo: [VIDEO_URL] (produced: `proof-output/finaltab-demo.mp4`, 92.7s, 1080p, 8 scenes with voiceover, recorded in one continuous session against the real app — upload it and fill the URL before submitting)
- **Live batch settlement** (chain-verified receipt, Base Sepolia): https://sepolia.basescan.org/tx/0x7bf655f3f72774839908021039e640b5ac8acaf5462b1376200cbb490045c12d
  (executionId `dthckv3julum6m5ktmdik`, block 45310631, `verified: true`, `receiptStatus: "success"` — 4.20 + 3.80 USDC pulled via EIP-3009, 8.00 USDC paid out atomically; fail-closed run report committed at `docs/release/evidence/`.)
- Earlier zero-value KeeperHub rail proof: https://sepolia.basescan.org/tx/0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c
  (executionId `g0w11wukbk1v0psyditx4`, block 45243955, `verified: true`, `receiptStatus: "success"`.)
- Settlement contract, deployed and code-confirmed on Base Sepolia: [`0xCcf6b4De…`](https://sepolia.basescan.org/address/0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64) — source not yet verified on Basescan.

**What is proven and what is not:** the settle leg is live-proven — `executeSettlement` moved 8.00 USDC atomically on Base Sepolia on 2026-08-10 (tx above), through the production API and KeeperHub, with exact balance deltas and a chain-verified receipt. Still not proven, stated because a submission that buries it is not honest: Supabase persistence is not applied (the app is stateless per session), the Claude/OpenAI fallback legs have never contacted their real APIs (only Groq is live), and the MetaMask signing path is stubbed (demo keys sign for real). Full per-surface labels in [docs/release/truth-snapshot.md](release/truth-snapshot.md).

## Best Onboarding UX Improvement entry

While building we hit the exact wall new KeeperHub agent developers hit: `completed` is not `landed`, and `--watch` can hang forever. So we contributed to KeeperHub/cli:

`kh execute status <id> --watch --require-verified --timeout 5m`

- `--require-verified`: exit non-zero unless the execution completed AND every onchain receipt is chain-verified with `receiptStatus "success"`. Fails closed on `reverted`, `not_found`, `timeout`, `safe_inner_failure`, and on completed-with-no-receipts.
- `--timeout`: `--watch` finally has a deadline, mirroring `transfer --wait`.
- One line gates any agent pipeline on real chain proof: `kh ex st <id> --watch --require-verified && ./next-step.sh`
- 7 new tests, back-compatible, follows the repo's own idioms. PR: https://github.com/KeeperHub/cli/pull/95 (open, not merged)

This complements upstream issue #49 (executionId status lookup for agents) and was motivated by the same onboarding friction documented in issue #47.

## Judging category mapping

| Category | Evidence |
|----------|----------|
| Onchain execution via KeeperHub | Live batch settlement tx `0x7bf655f3…` (8.00 USDC, chain-verified); exclusive execution layer; simulate-first; fail-closed receipt verification; flight-recorder CLI with honest exit codes |
| Technical quality | 189 + 11 = 200 tests; integer-only money; largest-remainder splits; ledger-hash-bound EIP-3009 nonces; atomic batch contract |
| Real-world usefulness | The last-mile settlement problem every split app punts on |
| UX | Photo -> English sentence -> one signature each -> verified receipt; onboarding contribution shipped upstream to the CLI |
| Honesty | Unproven states render as unproven; blockers documented in the repo, not hidden |
