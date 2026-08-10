# Next Steps

**Updated**: 2026-08-10
**Deadline**: August 13, 11:00 BST

This file previously declared "Sign Button Silent Failure" a P0 blocker and asked you to paste
console output. That blocker was **disproven** by live browser testing — the Sign button works. The
real defect nearby was a React crash on the Simulate path: an untyped `await res.json()` flowed into
`string`-typed state and React threw "Objects are not valid as a React child", white-screening the
app instead of rendering an honest failure. Fixed; 11 call sites now go through
`apps/web/lib/apiText.ts`, locked by 20 tests.

Nothing is blocked on more code.

## Evidence state

| Component | State | Basis |
|-----------|-------|-------|
| Engine + money | LIVE_PROVEN | 52 tests; real allocations reconciled cent-perfect against a live Groq proposal |
| Contract safety | FIXTURE_PROVEN | 11 Hardhat tests: atomicity, replay, nonce binding, expiry, 4 selector tests |
| Contract deployment | LIVE_PROVEN | `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64`, 2259 bytes via `eth_getCode`. Source not verified on Basescan. |
| KeeperHub integration | LIVE_PROVEN | executionId `g0w11wukbk1v0psyditx4`, tx `0x1130...278c`, `verified: true`, `receiptStatus: "success"` |
| Receipt extraction (Groq) | LIVE_PROVEN | Real requests through `/api/vision/extract` |
| Sign button | LIVE_PROVEN (demo keys) | Exercised in the browser; produces valid EIP-3009 signatures |
| `executeSettlement` onchain | **BLOCKED** | Never moved USDC on a public chain. Zero USDC in demo accounts, zero native ETH in the relayer. |
| Real wallet connection | UNPROVEN | MetaMask path stubbed; `eth_signTypedData_v4` not tested end-to-end |
| Supabase persistence | **NOT APPLIED** | Schema written, no credentials, nothing persisted. The app is stateless per session. |
| Claude / OpenAI fallback legs | FIXTURE_PROVEN | 12 cascade tests with each SDK mocked at the module boundary; neither has contacted its real API |

Per-surface detail: [docs/release/truth-snapshot.md](docs/release/truth-snapshot.md).

## Remaining work, all human-only

1. Submit the DoraHacks entry — copy drafted in [docs/submission.md](docs/submission.md).
2. Upload `proof-output/finaltab-demo.mp4` and fill the `[VIDEO_URL]` marker.
3. Publish the KeeperHub CLI PR from the prepared branch.
4. Rotate the Alchemy key, then `git gc --prune=now` to drop the dangling blobs that still hold both
   credentials on this machine. Neither key is in any commit — the earlier claim that they sat in
   `1f20560` was measured and found false. Reasoned through in
   [docs/release/user-actions.md](docs/release/user-actions.md).

## Optional: prove the settle leg live

Not required, and its absence is disclosed rather than hidden. Fund the relayer with Base Sepolia
ETH (KeeperHub sponsors transfers, not contract-call gas), fund two demo accounts with Base Sepolia
USDC, then run the journey to Execute. Until then the UI shows the blocked state, which is correct
behaviour rather than a bug.
