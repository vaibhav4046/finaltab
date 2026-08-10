# Truth snapshot — measured 2026-08-10

Every line here is either measured in this repo or measured against Base Sepolia.
Where something is unproven it says so. Nothing is upgraded to "proven" by
plausibility.

**Label meanings** — used consistently across the release docs:

| Label | Means |
|---|---|
| `LIVE_PROVEN` | Executed for real against the live service or chain, with a retained artifact |
| `FIXTURE_PROVEN` | Proven deterministically in tests against fixtures, not against the live service |
| `BLOCKED` | Code path exists and is tested, but cannot run for a stated, measured reason |
| `NOT_STARTED` | Not built |

---

## The one-paragraph honest version

The **KeeperHub execution rail is live-proven**: two independent flights were
submitted, polled to terminal state, and chain-verified on Base Sepolia. The
**batch settlement itself is not proven live** — `executeSettlement` has never
moved USDC on a public chain, because no account in the demo holds USDC and the
relayer holds no native ETH for contract-call gas. The contract is deployed and
its logic is proven by 11 Hardhat tests against a mock USDC. Everything upstream
of the settle leg — vision extraction, allocation, reconciliation, netting,
freezing, signing, calldata encoding, simulation — is proven, most of it live.
The app renders the blocked leg as blocked and never substitutes a replay.

---

## Evidence table

| Capability | Label | Evidence |
|---|---|---|
| KeeperHub auth + chain enablement | `LIVE_PROVEN` | `proof-output/first-flight-*.json`, `httpStatus 200`, chain 84532 `enabled: true` |
| KeeperHub submit → poll → chain-verified receipt | `LIVE_PROVEN` | 2 flights, both `VERIFIED_SETTLED`. tx [`0x11300427…`](https://sepolia.basescan.org/tx/0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c) block 45243955 gas 80521; tx [`0x98920aeb…`](https://sepolia.basescan.org/tx/0x98920aeb63caf322488ef4a61f344d5ff799c0b8f69b4255030f919a5be35f0e) block 45244012 gas 40921. Both `verified: true`, `receiptStatus: "success"` |
| Fail-closed verdict logic | `LIVE_PROVEN` | The same harness returned `FAILED` for the deploy attempt with the real upstream reason, rather than reporting success |
| Contract deployed on Base Sepolia | `LIVE_PROVEN` | `eth_getCode` on `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` → 2259 bytes |
| Contract source verified on Basescan | `NOT_STARTED` | No published source; this is why the settle route must pass `abi` inline |
| `executeSettlement` batch settlement onchain | `BLOCKED` | See "The settle leg" below. Never executed on a public chain |
| Contract logic (atomicity, replay, nonce binding, expiry) | `FIXTURE_PROVEN` | 11 Hardhat tests against `MockUSDC3009` |
| Calldata encoding for KeeperHub | `LIVE_PROVEN` | Decoded live request: selector `ab894f37`, both pulls carry `to = 0xCcf6b4De…`, values 19,440,000 + 11,670,000 = 31,110,000 = payout exactly |
| Receipt extraction (vision) | `LIVE_PROVEN` | Real Groq API, strict JSON schema, decimal-string amounts |
| LLM fallback routing Groq → Claude → OpenAI | `FIXTURE_PROVEN` (cascade) / `LIVE_PROVEN` (Groq leg only) | 12 tests drive the real router with each SDK mocked at the module boundary. **The Claude and OpenAI legs have never contacted their real APIs** — no keys are configured. See defects 11–12 |
| Non-USD refusal guard | `LIVE_PROVEN` | A GBP ledger renders "SPLIT ONLY — NOT SETTLEABLE ONCHAIN" and explicitly refuses to invent a GBP→USD rate. Σ = GBP 54.00, cent-perfect |
| Deterministic money core | `FIXTURE_PROVEN` | 52 engine tests: integer minor units, largest-remainder splits, `sum(shares) == total` |
| EIP-712 domain correctness | `LIVE_PROVEN` | `DOMAIN_SEPARATOR` and `RECEIVE_WITH_AUTHORIZATION_TYPEHASH` read from the live Base Sepolia USDC contract and matched |
| Flight recorder CLI | `FIXTURE_PROVEN` | 7 tests against a fake server |
| KeeperHub CLI contribution | `LIVE_PROVEN` (as *open*) | PR [#95](https://github.com/KeeperHub/cli/pull/95) — **open, not merged**. It will not be called merged until GitHub says merged |
| Web app deployed | `LIVE_PROVEN` | https://finaltab.vercel.app |
| MetaMask wallet connect | `NOT_STARTED` (live) | `apps/web/lib/wallet.ts` implements `eth_requestAccounts` for real, but it has never been exercised against an installed wallet. Demo path uses generated keys |
| Supabase persistence | `NOT_STARTED` | Schema written at `supabase/migrations/0001_init.sql`, applied nowhere. App is stateless per session |

---

## The settle leg — why it is BLOCKED, measured

Three independent reasons. Each was measured on 2026-08-10, not assumed. Any one
of them alone is sufficient to block.

1. **Every account holds zero USDC.** Both demo debtors and the KeeperHub relayer
   `0x7AE891Ec…` read `0.000000` USDC. A settle attempt reverts with
   `Error(ERC20: transfer amount exceeds balance)`.
2. **The relayer holds zero native ETH.** KeeperHub's own error is exact:
   `Insufficient BASE balance. Have: 0.0, Need: 0.000000231.` KeeperHub sponsors
   *transfers* but not *contract-call* gas — which is precisely why the two
   zero-value transfer flights succeeded while the contract-call deploy failed.
3. **The demo debtor keys are ephemeral.** `apps/web/lib/flow.ts:30` calls
   `generatePrivateKey()` per session; reloading the page produces entirely new
   addresses. **Any address funded today is dead on the next page load.**

Because of (3), a faucet top-up cannot close this. It needs a persistent signer
strategy first. That is a product decision plus a funded key, so it is recorded
in [user-actions.md](user-actions.md) rather than done autonomously.

**What the app does about it:** the settle path renders as blocked and the proof
capsule stays unproven. There is no code path that renders a mocked, replayed, or
screenshotted receipt as if it were live.

---

## Tests — measured, not remembered

Run: `pnpm -r --if-present test` plus `npx hardhat test`. Exit 0.

| Package | Passing |
|---|---|
| engine | 52 |
| keeperhub | 32 |
| vision | 32 (+1 skipped without a live `GROQ_API_KEY`) |
| keeperhub-flight-recorder | 7 |
| web (`apps/web`) | 66 |
| **workspace subtotal** | **189** |
| contracts (Hardhat) | 11 |
| **Total** | **200 passing, 1 skipped** |

No coverage percentage is claimed anywhere, because no coverage run has been
performed. `apps/web` previously had typecheck only and no test runner; a vitest
suite was added while fixing defect 9 below, so the gap is now partly closed —
the pure display-coercion layer is covered, React components and route handlers
still are not. They are exercised by driving the real app, not by jsdom.

---

## Corrections made to this repo's own claims

Twelve claim-versus-evidence defects were found and fixed. Listing them because a
"truth snapshot" that hides its own corrections is not one.

| # | Defect | Status |
|---|---|---|
| 1 | Extras always prorated proportionally regardless of the stated rule | Disclosed in the UI; capability gap remains |
| 2 | Image-quality gate had zero discriminating power (pristine fixture scored 62.7 vs threshold 100; canonical metric scores it 4149.8) | Fixed, live-verified |
| 3 | `docs/blockers.md` claimed the contract was undeployed and named a wrong predicted address | Fixed against `eth_getCode` |
| 4 | Contract/ABI signature mismatch would have reverted every settle | Fixed, locked by 4 selector tests |
| 5 | `analyzeImageQuality` claimed a score it did not compute | Fixed across 4 files |
| 6 | Docs advertised the **unsafe** `transferWithAuthorization` | Fixed in `README.md` and `docs/submission.md` |
| 7 | Every documented test count was stale (108 / 119 / 44 / 14) | Fixed across 7 files; an unverified "80%+ coverage" claim removed |
| 8 | A deployer private key was written in plaintext into judge-facing docs | Redacted in all 6 files. The "still in commit `1f20560`" claim this row used to carry was **false** and is retracted: the key survives in 8 **unreachable** blobs and in zero reachable objects, so it is not recoverable from a clone — see [user-actions.md](user-actions.md#1-deployer-private-key-in-unreachable-git-objects) |
| 9 | The honest-failure path crashed the app. Clicking **Simulate** returned the correct HTTP 409, then threw *"Objects are not valid as a React child"* and replaced the page with "Application error". An app whose claim is that it renders honest failures was white-screening on its most important failure | Fixed and live-verified — see below |
| 10 | A live Alchemy API key was written into 4 files, one of them a judge-facing setup doc | Redacted in all 4; `contracts/hardhat.config.js` now reads `BASE_SEPOLIA_RPC_URL` from the environment and falls back to the public endpoint. Surviving copies are in unreachable blobs only, same as defect 8. Rotate it anyway — it is a live service credential that was written to disk |
| 11 | Two of the five LLM-fallback tests asserted nothing about the code under test, while being named as if they did | Rewritten as 12 real cascade tests — see below |
| 12 | The OpenAI fallback leg requested model `gpt-4-vision`, which was never a served model id | Fixed to `gpt-4o` (overridable via `OPENAI_VISION_MODEL`). **The fix is reasoned, not measured** — no OpenAI key is configured, so this leg has still never run against the live API |

### Defects 11 and 12, because one hid the other

`packages/vision/test/fallbackRouter.test.ts` contained a test named *"succeeds
on Groq when configured and endpoint works"* whose entire body was
`expect(extractReceiptWithFallback).toBeDefined()`, and a test named *"preserves
receipt format across all providers"* that built a local object literal and
asserted the literal had the properties it had just been given. Neither called
the router. Both would have passed if the router body were `throw new Error()`.

They are now 12 tests that mock each SDK at the module boundary and drive the
real router: Groq wins and the paid providers are never called; Groq fails and
Claude wins; Groq and Claude fail and OpenAI wins; all three fail and it throws
rather than returning a partial receipt; a missing key skips its provider; a
provider returning HTTP 200 with schema-invalid JSON falls through instead of
handing junk to the money engine; a non-text Claude block and a null OpenAI
content are rejected rather than coerced; and the receipt is byte-identical
whichever provider won.

Writing them surfaced defect 12 immediately: the OpenAI call requested
`gpt-4-vision`. That leg would have failed on the first real fallback. Nothing
had ever executed it, so nothing had ever said so.

The honest status of this feature: **the cascade logic is `FIXTURE_PROVEN`, the
Groq leg is `LIVE_PROVEN`, and the Claude and OpenAI legs have never contacted
their real APIs.** "Fallback routing functional" overstates that and has been
corrected wherever it appeared.

### Defect 9 in detail, because it undercut the central claim

The settlement page renders the sentence *"Nothing here is simulated UI. Every
state — simulate, execute, verify — is a real KeeperHub API result, and the app
refuses to show success it cannot prove."* Live testing showed that when it
genuinely could not prove success, it did not render an honest failure — it
died.

Root cause was a type hole, not a logic error. `await res.json()` is `any`, so
`simDetail: json.detail ?? json.message` type-checked even though the 409 body's
`detail` is an **object**; `simDetail` is typed `string | null` and rendered
directly as a React child. `tsc` could not see it. The same bug class existed at
**11 call sites** across `ExecutionRail.tsx`, `SplitPanel.tsx`, and
`ReceiptPanel.tsx` — everywhere untyped JSON fed string-typed display state.

Fix: every such value now goes through `apps/web/lib/apiText.ts`, which coerces
unknown payloads to displayable strings (serialising objects, unwrapping
`Error`, clamping at 400 chars, falling back rather than printing `{}`). Locked
by 20 vitest cases in `apps/web/test/apiText.test.ts`.

Verified live, not merely compiled: the full flow was re-run end to end
(extract → allocate → net → freeze → sign → simulate) against the running app.
Simulate returned HTTP 409 three times; the page stayed alive each time and
rendered

> **WOULD REVERT — NOT BROADCAST**
> Simulation would revert: Error(ERC20: transfer amount exceeds balance) — …

with zero React errors in the console. The 409 itself is correct and expected —
it is blocker 1 of the settle leg, surfacing exactly as it should.

An earlier revision of this file stated "False Public Claims to Correct
Immediately: **None identified**". That was itself the most inaccurate line in
the repo, and this table replaces it.

An earlier revision also labelled the settlement flow `LIVE_PROVEN` on the
strength of tx `0x11300427…`. That transaction is `"type": "transfer"` — a
sponsored zero-value flight that proves the *rail*, not a settlement. The label
was wrong and is corrected above.

---

## Environment variables

Names and presence only. No values, prefixes, or lengths are recorded anywhere in
this repo.

| Variable | Status | Secret? |
|---|---|---|
| `GROQ_API_KEY` | PRESENT | Yes — server-only |
| `NVIDIA_API_KEY` | PRESENT | Yes — server-only |
| `KEEPERHUB_API_KEY` | PRESENT | Yes — server-only |
| `ELEVENLABS_API_KEY` | PRESENT | Yes — server-only |
| `NEXT_PUBLIC_SETTLEMENT_CONTRACT` | PRESENT | No — public contract address by design |
| `SUPABASE_URL` | MISSING | Yes — server-only |
| `SUPABASE_SECRET_KEY` | MISSING | Yes — server-only, must never carry `NEXT_PUBLIC_` |

No secret is prefixed `NEXT_PUBLIC_`. `.env.example` carries blank keys only.

---

## Repository state

- Branch `main`, 15 commits.
- Uncommitted working-tree changes across app, contracts, engine, and docs — all
  of them the fixes listed above.
- Two credentials survive in the local object database, both in **unreachable**
  blobs only: a deployer private key (8 dangling blobs) and an Alchemy API key
  (defect 10). Of the 305 objects reachable from any ref, **zero** contain
  either, so neither travels on a clone, fetch, or push. An earlier version of
  this bullet said they were "recoverable from git history" and named commit
  `1f20560`; that was measured and found false, and is retracted here rather than
  quietly edited. The working tree is clean of both. Remediation is
  `git gc --prune=now` plus an Alchemy rotation, both user actions recorded in
  [user-actions.md](user-actions.md).
