# Honest blocker list

Nothing here is faked in the app: blocked paths render as blocked, unproven states render as unproven.

## CURRENT V2 BLOCKERS — 2026-08-14

- Configure a verified-domain SMTP provider or Send Email Hook before claiming
  branded inbound email. The paid Privy custom-auth bridge is optional and is
  deliberately disabled under the stop-before-charge constraint.
- ~~Complete a real production microphone lifecycle.~~ **RESOLVED 2026-08-14.**
  The capture lifecycle was exercised against production on real hardware, in a
  signed-in Chrome session, with an operator-granted microphone permission
  (`navigator.permissions.query({name:'microphone'})` reporting `granted` and
  four audio inputs exposing labels). Sequence, in order, all observed live:
  1. First `Start listening` after the grant minted through to the budget layer
     and was refused: `POST /api/voice/token` returned **429** and the panel
     showed `NEEDS ATTENTION` with `VOICE_CONCURRENCY_LIMITED`, `Start
     listening` re-enabled and no `Stop` button. That is the configured limit
     doing its job — `user_concurrency_limit` is `1` with a `session_seconds`
     lease of 180 in `20260811064822_voice_spend_reservations.sql`, and a lease
     from an earlier mint still held the only slot. This is the first live
     production demonstration of the voice rate limiter, not a simulation.
  2. After the lease expired, `Start listening` returned **200** from
     `POST /api/voice/token`, the panel advanced to `LISTENING`, and the `Stop`
     control appeared.
  3. `Stop` returned the panel to `READY` with `Start listening` re-enabled and
     `Use transcript` / `Clear voice transcript` disabled, and a subsequent
     `getUserMedia` acquired a live track, so the app released the capture
     device rather than leaking it.

  No dictation was spoken during the session, so the transcript stayed empty:
  this proves acquisition, minting, budget enforcement and release, and it does
  **not** newly prove transcript-to-allocation behavior, which remains
  source- and test-proven.

  The failure paths were exercised on the same real device earlier the same
  day, before the grant: leaving the native permission prompt unanswered
  recovers through the 12s acquisition timeout to `NEEDS ATTENTION` with
  `Start listening` re-enabled, no `Stop` button, and **zero** `/api/voice/*`
  requests — refusing or ignoring the microphone mints no provider credential
  and costs no provider spend. This supersedes the earlier record of the same
  paths, which had used a **simulated** `getUserMedia`. Both remain
  regression-covered by `apps/web/test/voiceMicrophoneLifecycle.test.ts`.

  Separately live-verified on the deployed bundle: no permanent provider API
  key reaches the browser. All 11 same-origin scripts (515,245 bytes) were
  fetched and scanned — zero ElevenLabs `sk_` shapes and zero AssemblyAI
  32-hex-key shapes. The nine generic 32-hex matches in the DOM are Next.js
  per-request CSP nonces on font and style preloads, classified without
  printing any value.

  Still true, and unrelated to the grant: the headless operator probe
  `tests/e2e/voice-lifecycle.spec.ts` needs `E2E_VOICE_STORAGE_STATE`, and a
  live browser session cannot export one because the app's `connect-src 'self'`
  CSP blocks both a blob download and a loopback POST from the page. The
  lifecycle above was proven by driving the real UI instead.
- Keep the live non-value MCP probe separate from the retained value proof. The
  canonical release lists exactly nine tools and passed calculation/preparation;
  it did not call MCP submission, and the standalone settlement must not be
  relabeled as one.
- Do not call hybrid voice live end to end. Capture is proven (above), but no
  dictation has ever been spoken into the deployed app, so transcript delivery,
  provider `Begin`/`Termination`, and in-app ElevenLabs readback have never been
  observed live. They stay source- and test-proven. Speaking into the app costs
  AssemblyAI streaming seconds and a readback costs ElevenLabs characters, so
  closing this gap is a spend decision, not an engineering one.
- Keep two-identity isolation, review invalidation, and cross-channel journal
  recovery labeled source/test/schema-proven until separately exercised.
  Two-identity isolation is not gated on sign-in — one account is signed in —
  but on the absence of a second, distinct Supabase identity to test against.

The video and the submission are no longer blockers. The 4K/60 master is
published at <https://youtu.be/eXZACnOdt5w> (90.005 s, 3840×2160/60, 5,400 H.264
frames, sha256 `a14cfef3…b09c69`, visibility Unlisted) and DoraHacks
[BUIDL 47656](https://dorahacks.io/buidl/47656) is submitted, observed
`Under Review` on the live page on 2026-08-11 and confirmed submitted by the
operator on 2026-08-14. That status line is not re-verifiable logged out: the
public BUIDL page renders the full entry but exposes no submission-status field.
See [release/SUBMISSION_CHECKLIST.md](release/SUBMISSION_CHECKLIST.md).

V2 deployment itself is resolved: contract
`0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`, KeeperHub execution
`xasakw5nfxkh2s0fh4stn`, tx `0x904ec881…e8f`, block `45321107`, Sourcify exact
match `43497805`. **Everything below this paragraph is the preserved V1-era
closure and blocker log, not current V2 release truth.** Current readiness is
maintained in [release/status.md](release/status.md).

## Historical V1 closures

### KeeperHub ORGANIZATION key — RESOLVED 2026-08-09

- `kh_` org key provided and proven live. Three first-flight runs on Base Sepolia; the sponsored zero-value flight reached **VERIFIED_SETTLED** with a chain-verified receipt:
  - executionId `g0w11wukbk1v0psyditx4`
  - https://sepolia.basescan.org/tx/0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c (block 45243955, `verified: true`, `receiptStatus: "success"`)
- Full reports in `proof-output/first-flight-*.json`.
- API-shape discovery from the live probes is committed to the client, the web settle route, and the flight script. The encoding rule, corrected after a signature-mismatch bug: `functionArgs` **and** `abi` are both JSON-encoded strings, and `functionName` is the **bare** name (`executeSettlement`) whenever `abi` is supplied explicitly. The full canonical signature is only needed when KeeperHub has to auto-fetch the ABI — which it cannot do here, because the contract is not verified on Basescan. Basescan is still not verified; the V2 source was separately verified on Blockscout on 2026-08-14, after this entry was written. See `apps/web/lib/server/settlement.ts` and the 4 selector tests in `packages/engine/test/settlementAbi.test.ts`.

### Vercel deploy — RESOLVED

- Production live at https://finaltab.vercel.app (project root `apps/web`, `GROQ_API_KEY` + `KEEPERHUB_API_KEY` set server-side as encrypted env vars).

### KeeperHub CLI contribution — SHIPPED

- PR open: https://github.com/KeeperHub/cli/pull/95 (`--require-verified` for `execute status`). Open, **not merged**; the initially proposed `--timeout` option was removed, and the PR will not be described as merged unless GitHub shows it merged.

### Historical V1 ElevenLabs voiceover — DONE

- Key provided; 8 scene mp3s generated to `proof-output/voiceover/` (gitignored).
  The superseded V1 recording plan is retained in
  [DEMO_VIDEO_INSTRUCTIONS.md](release/DEMO_VIDEO_INSTRUCTIONS.md); the current
  [demo-storyboard.md](demo-storyboard.md) is the V2 nine-scene capture contract.

### Historical V1 live executeSettlement — RESOLVED 2026-08-10 (VERIFIED_SETTLED)

The full settlement path ran end-to-end through **production** (finaltab.vercel.app
API → KeeperHub → `FinalTabBatchSettlement` → Base Sepolia) and the chain proved it:

- tx `0x7bf655f3f72774839908021039e640b5ac8acaf5462b1376200cbb490045c12d`
  (block 45310631, `receiptStatus: "success"`, `verified: true`)
- executionId `dthckv3julum6m5ktmdik`, verdict **VERIFIED_SETTLED**
- 3 USDC `Transfer` logs (2 debtor pulls in + 1 creditor payout out) and exactly
  1 `SettlementExecuted` event whose indexed settlementId matches
  `keccak256(abi.encode(ledgerHash))`
- Balance deltas exact: creditor +8.000000 USDC, debtors −4.200000 / −3.800000;
  contract retained 0
- Full fail-closed report: `proof-output/live-settle-2026-08-10T19-19-04-531Z.json`,
  driver script `apps/web/scripts/live-settle.mjs`

How the blockers closed:

1. **USDC**: two persistent demo debtor signers (keys in gitignored
   `proof-output/demo-signers.local.json`) funded 20 USDC each from the Circle
   faucet, verified on-chain before the run.
2. **Relayer gas**: KeeperHub relayer `0x7AE891Ec51990684682a084381e97b59d787652B`
   funded 0.00005 ETH (tx `0xce5ec0bf…`, block 45310097). The working theory at the
   time was "KeeperHub sponsors transfers but not contract-call gas"; that theory
   was later disproven — every recorded `executeSettlement` run reports
   `sponsored: true` with gas paid by KeeperHub's own gas-payer EOA (measured via
   `eth_getTransactionByHash`: `from` on the settle txs is `0xdcf4bac4…`, not the
   relayer). The funding is kept on record because it happened and unblocked the
   deploy-attempt path.
3. **Encoding bug found live**: KeeperHub's execute pipeline rejects positional
   tuple arrays in `functionArgs` with `Invalid function arguments: pulls[0]:
   expected object for tuple` — while its *simulation* endpoint tolerates arrays,
   so the simulate-first gate passed and the execution failed (first attempt,
   executionId `0hs63ep2vjtjtj63rsak6`, failed harmlessly at argument parsing —
   nothing broadcast). `settleArgs` now emits tuples as objects keyed by ABI
   component names. This supersedes the "tuples as arrays" wording of the earlier
   API-shape note above.

Three more settlements followed the same day: `ks6wxg5vnmc833nd2yyk4` /
tx `0x770ada77…f120fc2` (block 45311736) and `dbukwam812iep68uehkhy` /
tx `0xac6d32e5…7c8710` (block 45312815, executed on camera in the demo video),
both 9.00 + 5.06 → 14.06 USDC — and the headline: an **AI agent settled a tab
end-to-end over MCP** with no UI, five JSON-RPC calls against production
`/api/mcp`, 1.20 + 0.80 → 2.00 USDC in under 3 seconds
(`69zzrj7z676u89ce1x76j` / tx `0x314189b4…c5eb`, block 45315909; step record
`docs/release/evidence/live-proof-4-mcp.json`).

## Historical V1 items that remained blocked

### 1b. Historical V1 contract is not verified on BaseScan

- `0xCcf6b4De…` has bytecode but no published source, so KeeperHub cannot auto-fetch
  its ABI. This is why the settle route must pass `abi` inline (and therefore uses the
  bare `functionName`). Verifying the source on Basescan would remove that coupling and
  make the transaction human-readable to a judge following the link.

### 1c. A deployer private key is in unreachable git objects

Found 2026-08-10 by a secret sweep of the judge-facing docs. A raw 64-hex
`DEPLOYER_PRIVATE_KEY` literal was pasted into copy-paste deploy instructions in
six files. **All six are now redacted in the working tree.**

This section previously ended "…but `SUBMISSION.md` was committed with it in
`1f20560`, so it remains recoverable from history." That was wrong and is
retracted. A per-blob walk of the whole object database put the key in 8
**unreachable** blobs and in none of the 305 objects reachable from any ref;
`git show 1f20560:SUBMISSION.md` returns no key. Since git only transfers
reachable objects, the key does not travel on a clone or a push — the exposure is
local to this machine, and `git gc --prune=now` clears it without touching a
single commit.

Measured blast radius, so this is not overstated: the key controls
`0x976EF25623A94F6F70924816697C7c7172210a5F`, which holds 0.0000967 testnet ETH
and 0 USDC, and whose single transaction deployed the settlement contract
(CREATE at nonce 0 matches `0xCcf6b4De…` exactly). `FinalTabBatchSettlement.sol`
has no owner, admin, pause, withdraw, or upgrade function, so the key grants
**no authority over anything deployed**. The cost is credibility, not funds.

Deciding between "burn the key and move on" and a `git filter-repo` history
rewrite is a destructive, irreversible choice, so it sits in
[user-actions.md](release/user-actions.md#1-deployer-private-key-committed-to-git-history)
rather than being done autonomously.

### 2. Hosted Supabase project state — infrastructure resolved 2026-08-11

- `finaltab-production` (`yoavihmldqbkuxinrsih`) is active in London
  (`eu-west-2`) on the free plan, with verified monthly cost `0`.
- The baseline migrations plus ordered additive migrations
  `20260811052236`, `20260811060000`, `20260811064822`, `20260811073000`, and
  `20260811074000`, plus `20260812023200` and `20260812090000`, are applied.
  Verification found 31/31 public tables with RLS;
  every sensitive new mutation RPC denies `PUBLIC`, `anon`, and
  `authenticated` and allows `service_role`. Database advisors report no
  error-level findings, and `60000` clears the remaining unindexed agent-event
  composite-FK warning. Reviewed RLS/function warnings and the
  leaked-password-protection warning remain.
- Post-promotion cutover `20260811074500` and `tab_owner_select_returning` are
  applied. Legacy direct financial writes and the old quota RPC deny browser
  roles; the new spend-reservation RPC is service-role-only.
- Canonical GitHub OAuth/reload and a real authenticated tab create/read,
  owner membership, participant add, and audit record passed. Multi-identity,
  invitation, durable journal recovery, and cross-device resume remain separate
  probes rather than inferred behavior.

## Pre-existing upstream noise (not ours, disclosed)

- KeeperHub/cli on Windows: 8 agentic-wallet/doctor tests fail on a CLEAN clone of main (looks like HOME vs USERPROFILE in test setup). Our package (`cmd/execute`) is green before and after our change.
