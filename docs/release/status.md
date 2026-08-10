# Status

**As of 2026-08-10, commit `d4dfb7e` plus an uncommitted working tree** (7 modified tracked files —
the MCP agent-settlement path and this documentation pass are not committed yet). One page, no
aspiration. Machine-readable twin:
[evidence.json](evidence.json). Gate runs: [gates.md](gates.md).

## One-line verdict

FINALTab is **submission-ready, end to end**: everything from receipt photo to the final broadcast
of `executeSettlement` is live-proven. On 2026-08-10 an AI agent settled a tab over the production
MCP endpoint, no UI involved — five JSON-RPC calls, 2.00 USDC moved atomically, under 3 seconds from
acceptance to on-chain success (tx
`0x314189b472033de62f8aea7603111c141315be390bc834e283e718382261c5eb`, block 45315909,
`verified: true`, executionId `69zzrj7z676u89ce1x76j`). Three more real batch settlements landed the
same day, e.g. 8.00 USDC via tx `0x7bf655f3…45c12d`, block 45310631. Gate 12, formerly the one
disclosed hole, now passes.

| Flag | State | Basis |
|---|---|---|
| `MAIN_READY` | **YES** | Deployed app, 212 passing / 1 skipped, contract live on Base Sepolia, six chain-verified KeeperHub receipts including four real batch settlements — one driven end-to-end by an AI agent over MCP (gate 12 closed 2026-08-10), 1:42 master video with a live settlement ON CAMERA (tx `0xac6d32e5…7c8710`, block 45312815). |
| `BOUNTY_READY` | **YES** | KeeperHub/cli PR [#95](https://github.com/KeeperHub/cli/pull/95) is open upstream — verified against the GitHub API on 2026-08-10. Tick the Best Onboarding UX box. |

Neither flag is a prediction about placing. They mean the required artifacts exist and every claim
attached to them has been measured.

## What works, proven live

| Capability | Proof |
|---|---|
| App deployed and reachable | https://finaltab.vercel.app |
| Receipt photo → items + amounts | Live Groq calls through `/api/vision/extract` |
| Plain-English allocation | Live Groq calls, reconciled cent-perfect against the engine |
| Blur / unusable-photo rejection | Fixed metric verified in-browser (pristine fixture: 62.7 under the old broken metric vs 4149.8 canonical) |
| Ledger freeze → canonical hash | 52 engine tests; hash locks edits by construction |
| EIP-3009 signing (demo keys) | Exercised in a real browser session; produces valid signatures |
| KeeperHub execution end to end | Six independent `VERIFIED_SETTLED` receipts, chain-confirmed, not merely status-field-confirmed |
| **AI agent settlement over MCP** | An agent drove the full loop against production `https://finaltab.vercel.app/api/mcp`: `get_balances` → `prepare_settlement` → `settle_tab` (`confirm: true`) → `settlement_status` (`VERIFIED_SETTLED` first poll) → `get_balances`. 1.20 + 0.80 USDC pulled, 2.00 paid out, under 3s. tx `0x314189b4…c5eb` (block 45315909, executionId `69zzrj7z676u89ce1x76j`). Record: `docs/release/evidence/live-proof-4-mcp.json` |
| **Live batch settlement (`executeSettlement`)** | Three more real settlements: tx `0x7bf655f3…45c12d` (block 45310631, 4.20 + 3.80 USDC pulled, 8.00 paid out), tx `0x770ada77…f120fc2` (block 45311736, executionId `ks6wxg5vnmc833nd2yyk4`, 9.00 + 5.06 pulled, 14.06 paid out), tx `0xac6d32e5…7c8710` (block 45312815, a second 9.00 + 5.06 → 14.06 run — executed ON CAMERA in the demo video). Exact balance deltas, contract retained zero. Reports: [evidence/](evidence/) + `proof-output/evidence-execution-*.json` |
| Settlement contract on Base Sepolia | 2259 bytes at `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64`, re-queried today |
| Honest failure rendering | The Simulate white-screen crash is fixed; 11 call sites routed through `apps/web/lib/apiText.ts`, locked by 20 tests |
| Build, types, tests | 212 passing / 1 skipped (web grew 66 → 78 with the MCP agent-settlement tests); `tsc` clean; 16-route production build clean |

## What does not work, stated plainly

| Gap | Why it is not hidden |
|---|---|
| Contract source unverified on Basescan | Concrete consequence: the settle route passes the ABI inline. |
| Supabase persistence | Schema written, never applied, no credentials. The app is stateless per session. Docs previously called this a working feature — that was wrong and is corrected. |
| Claude and OpenAI fallback legs | 12 cascade tests with each SDK mocked at the module boundary. Neither has contacted its real API. Only Groq is live. |
| Real-wallet signing | `eth_signTypedData_v4` path is stubbed. |
| Instruction fidelity on split rules | Extras are always prorated proportionally regardless of the rule stated. Disclosed in the UI. A real capability gap. |
| Coverage percentage | Never measured, so never claimed. Counts are reported instead. |
| Screenshots | The browser screenshot tool failed all session (`Screenshot timed out after 5s`). No still was captured and none is claimed. |

## Claims retracted during this pass

Two documented "facts" turned out to be false and are retracted in place rather than silently
edited:

1. **"Sign Button Silent Failure" was never real.** It was listed as a P0 blocker across several
   docs. Live browser testing showed the button works. The genuine defect nearby was a React crash
   on the Simulate path — an untyped `await res.json()` assigned into `string` state, producing
   "Objects are not valid as a React child". Fixed and locked by tests.
2. **A retraction that was itself wrong, now reversed.** An earlier pass of this document claimed
   `https://github.com/KeeperHub/cli/pull/95` "never existed" and stripped it from the checklist.
   That was written from a stale local task note ("worktree, no push") without querying GitHub. The
   PR is real: opened 2026-08-09 by `vaibhav4046`, `state: open`, `merged: false`, 1 commit,
   +336/−15, 7 new Go tests, base `KeeperHub:main`. Verified against the GitHub API on 2026-08-10.
   The original citation was correct and is restored. Recorded here rather than quietly reverted,
   because a false retraction is as much a documentation error as a false claim.

Every test count in the repo was also wrong (116, 119, 127 in various files). All were corrected
to the then-measured 200 / 1 skipped, and again to the freshly measured 212 / 1 skipped after the
MCP agent-settlement tests landed.

## Security posture

A deployer private key was committed across six judge-facing docs and an Alchemy API key across
four. Both are redacted in the working tree, and `hardhat.config.js` is now env-driven via
`BASE_SEPOLIA_RPC_URL` with a public fallback. Today's scan of every tracked file found zero live
key-shaped tokens.

**Residual risk, corrected 2026-08-10.** An earlier version of this section said both keys "remain in
git history at commit `1f20560`" and pointed readers at `git show 1f20560:SUBMISSION.md` to recover
one. That command was run: it returns no key. A full walk of the object database — all 190 blobs,
not just the commit graph — found both credentials alive in **unreachable** objects only: 8 dangling
blobs hold the deployer key, and the Alchemy key survives in dangling blobs inside
`…/v2/<key>` URLs. **Zero of the 305 objects reachable from any ref contain either.** Git transfers
only reachable objects, so neither is recoverable from a clone, fetch, or push of the public repo.

The exposure is real but local to the author's machine, and the fix is `git gc --prune=now` rather
than a history rewrite. The deployer key does control `0x976EF2…` as previously stated — verified by
a local one-way key→address derivation — and its blast radius is testnet dust with zero authority
over the deployed contract. Both remediations are user actions, reasoned through in
[user-actions.md](user-actions.md#1-deployer-private-key-in-unreachable-git-objects).

## Remaining work

None of it is code. All four items are outside autonomous scope:

1. Submit the DoraHacks entry — copy drafted in [../submission.md](../submission.md).
2. Upload `proof-output/finaltab-demo.mp4` and fill the `[VIDEO_URL]` marker.
3. Tick the Best Onboarding UX bounty box and paste
   https://github.com/KeeperHub/cli/pull/95 (already open upstream — nothing to publish).
4. Rotate the Alchemy key, and run `git gc --prune=now` to drop the dangling blobs that still hold
   both credentials locally. Neither is reachable from a commit, so neither reaches the public repo.

Gate 12 is closed. Both funding legs happened on 2026-08-10 — 20 testnet USDC per debtor from the
Circle faucet into the persistent demo signers, and 0.00005 ETH sent to the relayer directly
(tx `0xce5ec0bf…`, block 45310097; the deployer-key sweep was deliberately not used) — and the
journey then ran through Execute to **VERIFIED_SETTLED** on the production stack. Evidence in
[gates.md](gates.md) and [evidence/](evidence/).
