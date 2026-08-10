# Status

**As of 2026-08-10, commit `84e5397` plus an uncommitted working tree** (43 modified tracked files —
the demo-key persistence fix and this documentation pass are not committed yet). One page, no
aspiration. Machine-readable twin:
[evidence.json](evidence.json). Gate runs: [gates.md](gates.md).

## One-line verdict

FINALTab is **submission-ready with one disclosed hole**: everything from receipt photo to signed,
frozen, simulated settlement works live, and the final broadcast of `executeSettlement` has never
happened on a public chain because nobody funded the relayer or the demo accounts.

| Flag | State | Basis |
|---|---|---|
| `MAIN_READY` | **YES** | Deployed app, 200 passing / 1 skipped, contract live on Base Sepolia, two chain-verified KeeperHub receipts, 1:33 master video. The one gap (gate 12) is disclosed in the product UI, not hidden. |
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
| KeeperHub execution end to end | Two independent `VERIFIED_SETTLED` receipts, chain-confirmed, not merely status-field-confirmed |
| Settlement contract on Base Sepolia | 2259 bytes at `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64`, re-queried today |
| Honest failure rendering | The Simulate white-screen crash is fixed; 11 call sites routed through `apps/web/lib/apiText.ts`, locked by 20 tests |
| Build, types, tests | 200 passing / 1 skipped; `tsc` clean; 16-route production build clean |

## What does not work, stated plainly

| Gap | Why it is not hidden |
|---|---|
| `executeSettlement` has never moved USDC onchain | Relayer holds zero native BASE, demo accounts hold zero USDC. Simulate renders **WOULD REVERT — NOT BROADCAST** instead of replaying the old receipt. The full correction — including the defect that made the demo addresses unfundable in the first place — is in [gates.md](gates.md#gates-that-do-not-pass). |
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

Every test count in the repo was also wrong (116, 119, 127 in various files). All now read the
measured 200 / 1 skipped.

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

Optional, and its absence is disclosed rather than hidden: close gate 12. Two actions, neither of
which a faucet alone covers:

- Claim Base Sepolia USDC into the demo debtor addresses. These are now stable across reloads —
  set `NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS=1` and read the addresses off the funding panel. Before
  the 2026-08-10 fix they were reminted on every page load, so funding them was impossible, not
  merely unfinished.
- Run `contracts/scripts/fund-relayer.js` to sweep native ETH to the relayer. No faucet needed: the
  deployer already holds roughly 418× the required amount. It needs the deployer key, which is why it
  was not run here.

Then run the journey through to Execute.
