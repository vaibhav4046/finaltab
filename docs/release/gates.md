# Release Gates

Every row was run on **2026-08-10** against the working tree: commit `84e5397` **plus uncommitted
changes** (43 modified tracked files, 31 untracked at the time of the run). It is not a clean-checkout
result, and saying otherwise would misstate what was measured — re-running these commands on a fresh
clone of `84e5397` will produce the pre-fix numbers, not these. Nothing here is carried over from an
earlier session or inferred from a previous result. Where a gate cannot pass, it says so and names
what would unblock it rather than being quietly dropped from the table.

## Gate results

| # | Gate | Command | Result |
|---|------|---------|--------|
| 1 | Workspace tests | `pnpm -r --if-present test` | **PASS** — 189 passed, 1 skipped |
| 2 | Contract tests | `cd contracts && npx hardhat test` | **PASS** — 11 passing (841ms) |
| 3 | Type check | `cd apps/web && npx tsc --noEmit` | **PASS** — exit 0, no diagnostics |
| 4 | Production build | `cd apps/web && pnpm build` | **PASS** — 16 routes, static generation 16/16 |
| 5 | Bundle budget | build output | **PASS** — shared JS 102 kB; heaviest route `/app/tab` at 195 kB first-load (up 2 kB from the funding panel) |
| 6 | Secret scan (working tree) | `git ls-files \| xargs grep -E '<key patterns>'` | **PASS** — zero live `gsk_`/`sk-`/`xai-`/`alcht_` tokens in any tracked file. Working tree **only**; this gate is blind to the object database, which is why gate 16 exists |
| 7 | No tracked `.env` | `git ls-files \| grep '\.env'` | **PASS** — only `.env.example`, names only, no values |
| 8 | No key material in shipped source | grep for `privateKey = "0x…"` in `apps/`, `packages/*/src` | **PASS** — zero matches. The only 64-hex constants in frontend code are the public tx hash. |
| 9 | Contract live on chain | `eth_getCode` vs `https://sepolia.base.org` | **PASS** — 2259 bytes at `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64`, re-queried 2026-08-10 |
| 10 | Demo video integrity | `ffprobe proof-output/finaltab-demo.mp4` | **PASS** — 92.68s, 1920×1080, h264 + aac, 6,256,484 bytes |
| 11 | KeeperHub live execution | `proof-output/first-flight-*.json` | **PASS** — two independent `VERIFIED_SETTLED` receipts, both chain-confirmed |
| 12 | `executeSettlement` onchain | manual run to Execute | **BLOCKED** — see below |
| 13 | Contract source verified on Basescan | Basescan verify | **NOT DONE** |
| 14 | Coverage ≥ 80% | — | **NOT MEASURED** |
| 15 | Upstream CLI contribution live | `GET api.github.com/repos/KeeperHub/cli/pulls/95` | **PASS** — PR #95 `state: open`, `merged: false`, 1 commit, +336/−15, 7 new Go tests |
| 16 | Secret scan (whole object database) | `git cat-file --batch-all-objects` × all 190 blobs, cross-referenced against `git rev-list --objects --all` | **PASS for anything published, FAIL locally** — 0 of 305 reachable objects hold key material; 8 **unreachable** blobs do. See below. |

Full per-suite test breakdown:

```
packages/keeperhub                 32 passed  (3 files)
packages/engine                    52 passed  (7 files)
packages/keeperhub-flight-recorder  7 passed  (1 file)
packages/vision                    32 passed, 1 skipped  (3 files + 1 skipped)
apps/web                           66 passed  (2 files)
                                  ---------------------
workspace subtotal                189 passed, 1 skipped
contracts (hardhat)                11 passing
                                  ---------------------
TOTAL                             200 passing, 1 skipped
```

## Gates that do not pass

**12 — `executeSettlement` onchain.** The one capability the project cannot demonstrate live.

```
Insufficient BASE balance. Have: 0.0, Need: 0.000000231.
Fund 0x7ae891ec51990684682a084381e97b59d787652b with at least 0.000000231 BASE on this chain and retry.
```

KeeperHub sponsors **transfers** (`sponsored: true`) but not **contract-calls** (`sponsored: false`),
so the relayer must hold native BASE for this call and holds none. The demo accounts separately hold
zero Base Sepolia USDC.

An earlier revision of this document said the gate was blocked on funding alone. That was wrong, and
the correction matters because it changes what unblocking actually requires:

- **The demo debtor addresses were not fundable at all.** `makeDemoPeople()` called
  `generatePrivateKey()` on every invocation, so all three signers were reminted on every page load.
  A faucet transfer would have landed on an address that ceased to exist at the next refresh. Fixed
  2026-08-10: `apps/web/lib/demoKeys.ts` pins the signers to `localStorage` behind
  `NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS=1`, and `apps/web/components/FundingPanel.tsx` exposes the
  full addresses with live onchain balances. Ephemeral generation remains the default; the flag is
  opt-in, labelled in the UI, and testnet-only. Verified in-browser: with the flag set, the three
  addresses are byte-identical across a reload; with it unset, they rotate every load and nothing is
  written to storage.
- **The relayer leg does not need a faucet.** Measured against `https://sepolia.base.org` on
  2026-08-10, the deployer `0x976EF25623A94F6F70924816697C7c7172210a5F` holds `0x57e986e93ba4`
  (0.0000966605 ETH) — roughly 418× the 0.000000231 the relayer requires.
  `contracts/scripts/fund-relayer.js` sweeps the dust across. It has not been run: it needs the
  deployer key, and using a wallet key is outside autonomous scope.

So one funding action still needs a human (Base Sepolia USDC from Circle's login-gated faucet, into
the now-stable demo addresses), and one needs a human only to hold the key (the relayer sweep).

What the app does in the meantime matters more than the gate itself: Simulate renders
**"WOULD REVERT — NOT BROADCAST"**. It does not replay the earlier verified receipt, substitute a
fixture, or dress a mock up as a settlement. The blocked state is the honest render.

**13 — Basescan verification.** Not performed. The consequence is concrete rather than cosmetic: the
settle route passes the ABI inline because it cannot rely on a published one.

**14 — Coverage.** No coverage run has been performed, so no percentage is claimed anywhere in this
repo. The global standard is 80%; this project reports test *counts*, which are measured, instead of
a coverage figure that is not. Stating an unmeasured number would be worse than stating none.

**16 — Object-database secret scan.** This gate exists because gate 6 was not enough, and the gap it
left produced a false claim that shipped in five judge-facing documents.

Gate 6 greps `git ls-files`. That covers the working tree and nothing else, so a credential can be
fully redacted from every tracked file — gate 6 goes green — while the pre-redaction blob still sits
in the object database. That is exactly what happened here. Gate 16 walks every object instead:

| measurement | command | result |
|---|---|---|
| total blobs | `git cat-file --batch-all-objects` | 190 |
| objects reachable from any ref | `git rev-list --objects --all` | 305 |
| unreachable / dangling | `git fsck --unreachable --dangling` | 38 |
| service-key shapes (`gsk_`, `alcht_`, `xai-`, `nvapi-`, `sk-proj-`, `sk-ant-`) across all 190 blobs | grep, output redacted | **0** |
| blobs containing the deployer key | per-blob scan | 8, **all unreachable** |
| blobs containing the Alchemy key | per-blob scan | unreachable only |
| **reachable objects containing either credential** | intersection of the two sets | **0** |

Two conclusions, and they cut in opposite directions.

The published repository is clean. Git only transfers objects reachable from the refs being sent, so
no clone, fetch, or push of this repo can recover either credential. An earlier revision of
`user-actions.md`, `truth-snapshot.md`, `blockers.md`, `decisions.md`, and `status.md` told judges the
deployer key was committed at `1f20560` and could be recovered with `git show 1f20560:SUBMISSION.md`.
That command was run. It returns no key — the only 64-hex string in that blob is the public Basescan
transaction hash. All five documents now carry the retraction in place rather than a silent edit.

The local machine is not clean. Both credentials are genuinely recoverable from the dangling blobs by
anyone with disk access, and the deployer key is real: a local one-way key-to-address derivation (no
signing, no broadcast, no network) resolves it to `0x976EF25623A94F6F70924816697C7c7172210a5F`. Its
blast radius is testnet dust and zero authority over the deployed contract, which is mitigation, not
absolution. Remediation is `git reflog expire --expire-unreachable=now --all && git gc --prune=now` —
no commit is touched and no hash changes, so `filter-repo` is both unnecessary and the wrong tool.
Not run here: deleting git objects is irreversible, so it sits in
[user-actions.md](user-actions.md).

## The skipped test

One test in `packages/vision` is skipped because it requires a live `GROQ_API_KEY` in the test
environment. It is skipped rather than mocked-and-counted, so the pass total stays honest.

## Reproducing

```bash
pnpm install
pnpm -r --if-present test
cd contracts && npx hardhat test
cd apps/web && npx tsc --noEmit && pnpm build
```

Do not run `pnpm build` while the dev server is up — the two contend over `.next/` and the build
output becomes unreliable. Stop the dev server first.
