# Honest blocker list

Nothing here is faked in the app: blocked paths render as blocked, unproven states render as unproven.

## RESOLVED

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

### ElevenLabs voiceover — DONE

- Key provided; 8 scene mp3s generated to `proof-output/voiceover/` (gitignored). Storyboard in [demo-storyboard.md](demo-storyboard.md).

## STILL BLOCKED

### 1. No funded signers on Base Sepolia (blocks the live settle leg only)

**The deploy is no longer blocked — it happened.** An earlier revision of this file
claimed the contract was gas-blocked and named predicted address
`0xEaf9E9d90a080Fa01E7Eb671AFB5B3f0B445F013`. That was stale and the address is
wrong. Verified against Base Sepolia on 2026-08-10 via `eth_getCode`:

| address | code size | state |
|---|---|---|
| `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` | 2259 bytes | **deployed** — this is the live contract, and it is what `NEXT_PUBLIC_SETTLEMENT_CONTRACT` points at |
| `0xEaf9E9d90a080Fa01E7Eb671AFB5B3f0B445F013` | 0 bytes | never deployed; the old predicted address, now meaningless |

What is genuinely still blocked is executing a settlement, for two independent
reasons. Both were measured, not assumed:

1. **Every account holds zero USDC.** Both demo debtors and the KeeperHub relayer
   `0x7AE891Ec51990684682a084381e97b59d787652B` read 0.000000 USDC. A settle
   attempt reverts with `Error(ERC20: transfer amount exceeds balance)`.
2. **The relayer holds zero native ETH** (`eth_getBalance` → 0 wei). KeeperHub
   sponsors transfers but not contract-call gas, so even a funded debtor set
   would not get the call mined.

**A faucet top-up alone does not fix this.** `apps/web/lib/flow.ts:30` calls
`generatePrivateKey()` per session, so the demo debtor addresses are regenerated
on every page load — confirmed by reloading and watching entirely new addresses
appear. Any address funded now is dead on the next reload. Closing this needs a
persistent signer strategy (a fixed dev keypair loaded from env, or an injected
browser wallet), not a one-off transfer. That is a product decision plus a funded
key, so it sits in the USER ACTION table rather than being done autonomously.

Until then the app refuses to fake it: the settle path renders as blocked and the
proof capsule stays unproven rather than showing a replayed or mocked receipt.

### 1b. Contract is not verified on Basescan

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

### 2. Supabase project credentials

- Schema complete at `supabase/migrations/0001_init.sql`, not applied anywhere.
- Fix: create a free Supabase project, fill `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (+ the two `NEXT_PUBLIC_*` values) in `apps/web/.env.local`, run the migration.
- Until then the app is stateless per session; core flow works without persistence.

## Pre-existing upstream noise (not ours, disclosed)

- KeeperHub/cli on Windows: 8 agentic-wallet/doctor tests fail on a CLEAN clone of main (looks like HOME vs USERPROFILE in test setup). Our package (`cmd/execute`) is green before and after our change.
