# Honest blocker list

Nothing here is faked in the app: blocked paths render as blocked, unproven states render as unproven.

## CURRENT V2 BLOCKERS — 2026-08-11

- Apply and verify additive migrations `52236` (agent control), `64822` (voice
  spend reservations), `73000` (first-party flow), and `74000` (shared
  UI/REST/MCP submission journal), then promote and apply `74500` to revoke
  legacy writes. The hosted schema remains at the verified four-migration,
  19-table baseline until then.
- Complete the Privy dashboard/JWKS/domain/identity-token/verifier setup and
  live-probe subject pairing. Configure a verified-domain SMTP provider or Send
  Email Hook separately before claiming branded inbound email.
- Deploy the current exactly-nine-tool MCP/product release; probe auth,
  multi-identity persistence, review invalidation, voice, and the live tool list.
- Bind the V2 MCP trace, KeeperHub receipt, independent V2 event/balance proof,
  and final 4K/60 product video to one truthful evidence package.
- Upload that video and complete the human DoraHacks form.

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
- API-shape discovery from the live probes is committed to the client, the web settle route, and the flight script. The encoding rule, corrected after a signature-mismatch bug: `functionArgs` **and** `abi` are both JSON-encoded strings, and `functionName` is the **bare** name (`executeSettlement`) whenever `abi` is supplied explicitly. The full canonical signature is only needed when KeeperHub has to auto-fetch the ABI — which it cannot do here, because the contract is not verified on Basescan. See `apps/web/lib/server/settlement.ts` and the 4 selector tests in `packages/engine/test/settlementAbi.test.ts`.

### Vercel deploy — RESOLVED

- Production live at https://finaltab.vercel.app (project root `apps/web`, `GROQ_API_KEY` + `KEEPERHUB_API_KEY` set server-side as encrypted env vars).

### KeeperHub CLI contribution — SHIPPED

- PR open: https://github.com/KeeperHub/cli/pull/95 (`--require-verified` + `--timeout` for `execute status`). Open, **not merged**; it will not be described as merged unless GitHub shows it merged.

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
- Four migrations are applied. Verification found 19/19 tables with
  RLS, 45 policies, no anonymous table grants, and 34/34 foreign keys covered
  by indexes. The durable voice quota table has no direct anonymous or
  authenticated grants; its consumer RPC is authenticated-only.
- Additive migrations `20260811052236`, `20260811064822`, `20260811073000`, and
  `20260811074000` are committed in source but not yet applied. Post-promotion
  cutover `20260811074500` must follow the candidate probe. Recount RLS,
  policies, grants, and indexes after the ordered rollout.
- Remaining release gate: deploy the newer application and live-probe auth,
  invitations, approvals, durable history, and cross-device resume with more
  than one identity. Provisioning alone does not prove those browser behaviors.

## Pre-existing upstream noise (not ours, disclosed)

- KeeperHub/cli on Windows: 8 agentic-wallet/doctor tests fail on a CLEAN clone of main (looks like HOME vs USERPROFILE in test setup). Our package (`cmd/execute`) is green before and after our change.
