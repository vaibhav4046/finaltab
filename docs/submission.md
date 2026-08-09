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
- **Gasless for debtors.** Each debtor signs USDC `transferWithAuthorization` (EIP-3009). No approvals, no allowances, no debtor gas.
- **Atomic batch.** `FinalTabBatchSettlement.executeSettlement` moves everyone's USDC in one transaction on Base Sepolia. One bad signature reverts the whole batch. Replay is blocked by settlementId derived from the ledger hash. 11 Hardhat tests cover atomicity, replay, nonce binding, and expiry.
- **KeeperHub is the only execution layer.** Simulate first; a failed simulation is never broadcast. Then execute, then poll status honoring `X-Poll-Interval-Hint` and `Retry-After`. The app shows VERIFIED_SETTLED only when the execution is terminal-successful AND a receipt exists AND `verified === true` AND `receiptStatus === "success"`. A transaction hash proves submission; only a verified receipt proves landing. There is no code path that fakes a transaction state.

**Numbers:** 108 passing workspace tests + 11 Hardhat tests. Zero-budget stack: Next.js on Vercel free, Supabase free, Groq free tier, KeeperHub.

- Live app: [DEPLOY_URL]
- Repo: [REPO_URL]
- Demo: [VIDEO_URL]
- Verified settlement: [TX_LINK]

## Best Onboarding UX Improvement entry

While building we hit the exact wall new KeeperHub agent developers hit: `completed` is not `landed`, and `--watch` can hang forever. So we contributed to KeeperHub/cli:

`kh execute status <id> --watch --require-verified --timeout 5m`

- `--require-verified`: exit non-zero unless the execution completed AND every onchain receipt is chain-verified with `receiptStatus "success"`. Fails closed on `reverted`, `not_found`, `timeout`, `safe_inner_failure`, and on completed-with-no-receipts.
- `--timeout`: `--watch` finally has a deadline, mirroring `transfer --wait`.
- One line gates any agent pipeline on real chain proof: `kh ex st <id> --watch --require-verified && ./next-step.sh`
- 7 new tests, back-compatible, follows the repo's own idioms. PR: [PR_URL]

This complements upstream issue #49 (executionId status lookup for agents) and was motivated by the same onboarding friction documented in issue #47.

## Judging category mapping

| Category | Evidence |
|----------|----------|
| Onchain execution via KeeperHub | Exclusive execution layer; simulate-first; fail-closed receipt verification; flight-recorder CLI with honest exit codes |
| Technical quality | 108 + 11 tests; integer-only money; largest-remainder splits; ledger-hash-bound EIP-3009 nonces; atomic batch contract |
| Real-world usefulness | The last-mile settlement problem every split app punts on |
| UX | Photo -> English sentence -> one signature each -> verified receipt; onboarding contribution shipped upstream to the CLI |
| Honesty | Unproven states render as unproven; blockers documented in the repo, not hidden |
