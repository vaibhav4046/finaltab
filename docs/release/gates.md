# Historical V1 release gates

> **Archived measurement, not the current V2 gate.** The table below preserves
> the 2026-08-10 V1 run, including its old contract address, test counts, and
> video measurement. Current V2 truth: contract
> `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`, KeeperHub deployment execution
> `xasakw5nfxkh2s0fh4stn`, tx `0x904ec881…e8f`, block `45321107`, Sourcify exact
> match `43497805`. Canonical deployment
> `dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs` at commit
> `039582fc44901d1f436b61a426f1523a936427f9` supersedes the archived release:
> Vercel reports `READY`, while current-commit CI and Playwright are not inferred
> from the prior deployment. Current V2 additions: KeeperHub execution
> `3hmlqi36zweiwg6fc5o2u` moved one atomic unit of USDC in tx
> `0x7a6fb760…a789` at block `45327128`, with exact event/balance proof; Supabase
> project `yoavihmldqbkuxinrsih` is provisioned and schema-verified with its four
> baseline/additive, financial cutover, and owner-select migrations: 31/31
> public tables have RLS, sensitive mutation RPCs and legacy writes deny browser
> roles, and advisors report zero error-level findings with reviewed warnings remaining. A
> real GitHub OAuth/reload, owner tab create/read, exactly-nine-tool list, and
> non-value MCP calculation/preparation passed. The public product film is
> <https://youtu.be/eXZACnOdt5w>: 90.005s, 3840×2160/60 fps, 5,400 H.264 video
> frames plus AAC audio, 35,617,576 bytes, SHA-256
> `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69`.
> Its narration is local Kokoro; the denied ElevenLabs preflight made one quota
> GET, zero synthesis POSTs, and no retry. The filmed MCP flow performs no sign,
> submit, broadcast, or value action; the retained settlement is separate. A
> real browser voice lifecycle remains pending. DoraHacks
> [BUIDL 47656](https://dorahacks.io/buidl/47656) is submitted and `Under Review`
> with its Best Onboarding UX Improvement bounty application saved. KeeperHub
> CLI PR #95 is open/unmerged and adds only `--require-verified`. Use
> [status.md](status.md) and [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md).

Every row was run on **2026-08-10**. Gates 1–16 were measured against a clean tree at commit
`b258ec3` and re-measured unchanged against the tree this commit publishes; gates 17–18 were added by
that re-measurement. The only delta between the two trees is three static PWA assets and the manifest
entry that names them, which is why the test, type, and bundle numbers are identical across both. A
fresh clone reproduces them — the four commands under [Reproducing](#reproducing) are the ones that
produced them.

That was not true until this commit, and the earlier disclaimer is kept here rather than deleted,
because the gap it described was real: these gates were first measured against `84e5397` **plus 74
uncommitted working-tree entries**, while `origin/main` sat seven commits back at `22e0c46`. Anyone
cloning the published repo at that point would have hit the React crash on Simulate, found no
evidence pack, and reproduced none of this table. The measurements were honest about the tree they
ran against; the tree simply was not the one a judge could obtain. Publishing `b258ec3` closed that
gap, and the numbers below were then re-measured against the committed state rather than carried
over.

Nothing here is inferred from an earlier session or from a previous result. Where a gate cannot pass,
it says so and names what would unblock it rather than being quietly dropped from the table.

## Gate results

| # | Gate | Command | Result |
|---|------|---------|--------|
| 1 | Workspace tests | `pnpm -r --if-present test` | **PASS** — 200 passing, 1 skipped. `contracts` is a workspace member, so this one command runs the Hardhat suite too; the 189 below is the Vitest portion, not the whole command |
| 2 | Contract tests | `cd contracts && npx hardhat test` | **PASS** — 11 passing (944ms). Re-run in isolation; also reachable as `pnpm --filter contracts test` |
| 3 | Type check | `cd apps/web && npx tsc --noEmit` | **PASS** — exit 0, no diagnostics |
| 4 | Production build | `cd apps/web && pnpm build` | **PASS** — 16 routes, static generation 16/16 |
| 5 | Bundle budget | build output | **PASS** — shared JS 102 kB; heaviest route `/app/tab` at 195 kB first-load (up 2 kB from the funding panel) |
| 6 | Secret scan (working tree) | `git ls-files \| xargs grep -E '<key patterns>'` | **PASS** — zero live `gsk_`/`sk-`/`xai-`/`alcht_` tokens in any tracked file. Working tree **only**; this gate is blind to the object database, which is why gate 16 exists |
| 7 | No tracked `.env` | `git ls-files \| grep '\.env'` | **PASS** — only `.env.example`, names only, no values |
| 8 | No key material in shipped source | grep for `privateKey = "0x…"` in `apps/`, `packages/*/src` | **PASS** — zero matches. The only 64-hex constants in frontend code are the public tx hash. |
| 9 | Historical V1 contract live on chain | `eth_getCode` vs `https://sepolia.base.org` | **PASS** — 2259 bytes at `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64`, re-queried 2026-08-10 |
| 10 | Demo video integrity | `ffprobe proof-output/finaltab-demo.mp4` | **PASS** — 92.68s, 1920×1080, h264 + aac, 6,256,484 bytes |
| 11 | KeeperHub live execution | `proof-output/first-flight-*.json` | **PASS** — two independent `VERIFIED_SETTLED` receipts, both chain-confirmed |
| 12 | `executeSettlement` onchain | `apps/web/scripts/live-settle.mjs` against production | **PASS** — VERIFIED_SETTLED, tx `0x7bf655f3…45c12d`, block 45310631, 8.00 USDC moved atomically. See below |
| 13 | Historical V1 source verified on BaseScan | BaseScan verify | **NOT DONE** — unrelated to V2 Sourcify exact match |
| 14 | Coverage ≥ 80% | — | **NOT MEASURED** |
| 15 | Upstream CLI contribution live | `GET api.github.com/repos/KeeperHub/cli/pulls/95` | **PASS** — PR #95 `state: open`, `merged: false`, 1 commit, +336/−15, 7 new Go tests |
| 16 | Secret scan (whole object database) | `git cat-file --batch-all-objects` × all 190 blobs, cross-referenced against `git rev-list --objects --all` | **PASS for anything published, FAIL locally** — 0 of 305 reachable objects hold key material; 8 **unreachable** blobs do. See below. |
| 17 | Full journey exercised in a real browser | Playwright against the running app: upload → extract → allocate → net → freeze → sign ×2 → simulate | **PASS** — ran end to end on live providers. Transcript below. |
| 18 | Console clean on load | `browser_console_messages` after loading `/app/tab` | **PASS** — 0 errors, 0 warnings. Was 2 errors before the manifest fix below. |

Full per-suite test breakdown:

```
packages/keeperhub                 32 passed  (3 files)
packages/engine                    52 passed  (7 files)
packages/keeperhub-flight-recorder  7 passed  (1 file)
packages/vision                    32 passed, 1 skipped  (3 files + 1 skipped)
apps/web                           66 passed  (2 files)
                                  ---------------------
Vitest subtotal                   189 passed, 1 skipped
contracts (hardhat)                11 passing
                                  ---------------------
TOTAL                             200 passing, 1 skipped
```

`contracts` is listed in `pnpm-workspace.yaml`, so a single `pnpm -r --if-present test` produces
the TOTAL line, not the subtotal. The split above is by *runner* (Vitest vs Hardhat), not by
whether a second command is needed — an earlier revision of this file implied it was.

**Post-run annotation (2026-08-10, later the same day).** The numbers above are what that gate
run measured and are preserved unchanged. Since then the working tree gained the MCP
agent-settlement path: `apps/web` grew 66 → 78 tests (`test/agentSettlement.test.ts`, 12 tests)
and a fresh full `pnpm -r --if-present test` run measured **212 passing, 1 skipped** (201 Vitest
+ 11 Hardhat, exit 0). Gate 12 was also joined by three more live settlements the same day,
including one driven end to end by an AI agent over MCP (tx `0x314189b4…c5eb`, block 45315909,
executionId `69zzrj7z676u89ce1x76j`, 2.00 USDC, <3s). Gate 10's ffprobe line reflects the video
cut current at run time; the master has since been re-recorded.

**Second post-run annotation (2026-08-14).** The 2026-08-10 table above is left exactly as that run
measured it. Two of its lines are now stale, and here is what a re-measurement on 2026-08-14
produced instead:

- **Gate 1 (tests).** `pnpm test` exits 0 with **524 passing, 1 skipped** — 497 Vitest (engine 60,
  keeperhub 37, vision 37 +1 skipped, flight-recorder 7, `apps/web` 356 across 39 files) plus 27
  Hardhat. Both the original 200 and the first annotation's 212 predate the voice, RLS, replay and
  agent-control suites. `pnpm test` also builds `contracts` first, so it is still the single command
  that produces the total.
- **Gate 10 (video).** The published V2 master is <https://youtu.be/eXZACnOdt5w>, verified live on
  2026-08-14 (title "FINALtab Product for KeeperHub - Agents Onchain Hackathon", player duration
  90.021 s, visibility **Unlisted**). The render behind it measures **90.005 s, 3840×2160, 60 fps,
  h264 + aac, 35,617,576 bytes**, sha256
  `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69`.

  An earlier revision of this line described the gitignored working file
  `proof-output/finaltab-demo.mp4` (**101.64 s, 1920×1080, 25 fps, h264 + aac, 7,472,357 bytes**,
  sha256 `de8aa3018f690cbf31ce1737924a0e59a1ca30bdd715489db5ff46459262fbb7`) as the master and said
  no public URL existed. That was wrong on both counts: it is a different file with a different
  hash, and the master was already published. Neither file is obtainable from the repository,
  because `proof-output/` is gitignored.

Gate 14 (coverage) is still **NOT MEASURED** — no coverage run has been performed, and a larger test
count is not a coverage figure.

## Gate 17 — the journey, as actually observed

Every number in this section was read off the running app, not computed here and asserted. The run
used `apps/web/public/fixtures/synthetic-receipt-usd.png` — labelled synthetic in its own filename,
tracked in the repo so the run is repeatable — against live providers.

| step | observed |
|---|---|
| Extraction | Groq, **first pass**, arithmetic verified. `TEST DINER`, currency USD, items 14.00 / 18.00 / 16.00 / 6.00, subtotal 54.00, tax 4.86, tip 11.14, **total 70.00** |
| Allocation (plain English) | Vee 18.15, Hem 32.41, Ravi 19.44 — Σ **70.00**, equal to the receipt total |
| Netting | Hem → Vee 32.41 USDC; Ravi → Vee 19.44 USDC |
| Freeze | ledgerHash `0x97aeba845f65c9dad8d9c11e249b55bdbef306ece8751d6ef55ee1fcc1b663ca`, settlementId `0xe803bc5b36002cff46f43130fb75e05925c3890351244ef83651ecae55151ec3` |
| Consent | two EIP-712 signatures, one per debtor, each bound to the ledgerHash, recipient = the settlement contract `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` |
| Simulate | HTTP **409 Conflict**, `wouldRevert: true` |

The allocation was recomputed independently rather than taken on trust, and it is cent-exact: item
subtotals are 14.00 / 25.00 / 15.00 = 54.00, and the 16.00 of extras prorate by item share to
4.15 / 7.41 / 4.44, which sums to exactly 16.00. Largest-remainder, no float drift, no rounding
residue parked on one person.

Simulate rendered this, verbatim:

```
WOULD REVERT — NOT BROADCAST

Simulation would revert: Error(ERC20: transfer amount exceeds balance)
{"success":false,"status":"simulated",
 "from":"0x7ae891ec51990684682a084381e97b59d787652b",
 "to":"0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64",
 "value":"0","wouldRevert":true,
 "revertReason":"Error(ERC20: transfer amount exceeds balance)"}
```

Two things about that screen matter more than the fact that it rendered.

The Execute step showed **no button at all**. The app does not offer a broadcast it knows would
revert; the control is absent rather than present-and-failing. And the revert reason is the true one —
the demo signers hold zero Base Sepolia USDC, so a real pull genuinely could not clear. Nothing was
replayed, substituted, or dressed up.

This gate exists because the Simulate path is the one that used to white-screen. Saying it was fixed
was not the same as watching it render, so it was watched.

**Manifest fix found while doing this.** `manifest.webmanifest` declared `/icon-192.png`,
`/icon-512.png`, and `/screenshot-mobile-540.png`, none of which existed — two console 404s on every
page load. The entries were not deleted to silence the error; the assets were produced. Both icons
were rasterized from the real `icon.svg`, and the screenshot is a genuine 540×720 capture of `/app`.
Sizes were verified by parsing each PNG's IHDR header against the manifest's declared `sizes`:
192×192, 512×512, 540×720. The previously-unreferenced `icon-maskable.svg` was wired up at the same
time. Gate 18 is the confirmation.

## Gate 12 — closed 2026-08-10

Formerly the one capability the project could not demonstrate live. It has now run on the
production stack and the chain confirmed it:

- tx `0x7bf655f3f72774839908021039e640b5ac8acaf5462b1376200cbb490045c12d` (block 45310631,
  `verified: true`, `receiptStatus: "success"`), executionId `dthckv3julum6m5ktmdik`, verdict
  **VERIFIED_SETTLED**. 4.20 + 3.80 USDC pulled from the two persistent demo debtors via
  EIP-3009, 8.00 USDC paid to the creditor, one atomic call; 3 USDC `Transfer` logs plus exactly
  1 `SettlementExecuted` event bound to the ledgerHash; balance deltas exact
  (+8.00 / −4.20 / −3.80); the contract retained zero. Committed fail-closed report:
  [evidence/live-settle-2026-08-10T19-19-04-531Z.json](evidence/live-settle-2026-08-10T19-19-04-531Z.json).

What unblocked it, in the order the earlier BLOCKED revision of this section predicted:

- The persistent demo signers (behind `NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS=1`) were funded
  20 Base Sepolia USDC each from the Circle faucet — possible only because the 2026-08-10
  stability fix made the addresses survive a reload.
- The relayer was funded 0.00005 ETH directly (tx `0xce5ec0bf…`, block 45310097) rather than via
  the deployer sweep, keeping the deployer key untouched. The relayer error that defined the
  blocked state was, verbatim: `Insufficient BASE balance. Have: 0.0, Need: 0.000000231.` —
  KeeperHub sponsors **transfers** but not **contract-call** gas.
- A real encoding bug surfaced only at execute time: KeeperHub's execute pipeline rejects
  positional tuple arrays (`Invalid function arguments: pulls[0]: expected object for tuple`)
  while its simulate endpoint tolerates them, so the first attempt (executionId
  `0hs63ep2vjtjtj63rsak6`) failed harmlessly at argument parsing — nothing broadcast.
  `settleArgs` now emits tuples as objects keyed by ABI component names; the second run settled.
  The committed failure report sits next to the success report in [evidence/](evidence/).

What the app did while blocked still matters: Simulate rendered **WOULD REVERT — NOT BROADCAST**
and Execute offered no button — exercised in a browser and transcribed in
[gate 17](#gate-17--the-journey-as-actually-observed), down to the revert reason. It never
replayed the earlier verified receipt or dressed a mock up as a settlement. The full blocked-era
write-up (the unfundable-address defect and its fix, the deployer-sweep alternative deliberately
not used) is preserved in [blockers.md](../blockers.md).

## Gates that do not pass

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

The published repository is clean, and this is no longer an argument from how git works — it was
checked directly against the published artifact. `github.com/vaibhav4046/finaltab` was cloned fresh
at `b258ec3` and every blob the clone received was scanned:

| measured on the fresh clone | result |
|---|---|
| blobs received | 237 |
| service-key shapes (`gsk_`, `alcht_`, `xai-`, `nvapi-`, `sk-proj-`, `sk-ant-`) | **0** |
| live `g.alchemy.com/v2/<key>` URLs | **0** |
| copies of the deployer private key | **0** |
| `git show 1f20560:SUBMISSION.md` | one 64-hex string, and it is the public Basescan tx hash |

Git only transfers objects reachable from the refs being sent, which is *why* the clone is clean; the
scan above is the evidence that it is. An earlier revision of
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
