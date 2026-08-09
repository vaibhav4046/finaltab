# Honest blocker list

Nothing here is faked in the app: blocked paths render as blocked, unproven states render as unproven.

## RESOLVED

### KeeperHub ORGANIZATION key — RESOLVED 2026-08-09

- `kh_` org key provided and proven live. Three first-flight runs on Base Sepolia; the sponsored zero-value flight reached **VERIFIED_SETTLED** with a chain-verified receipt:
  - executionId `g0w11wukbk1v0psyditx4`
  - https://sepolia.basescan.org/tx/0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c (block 45243955, `verified: true`, `receiptStatus: "success"`)
- Full reports in `proof-output/first-flight-*.json`.
- API-shape discovery from the live probes (field is `functionName` with the full signature; args go in `functionArgs` as a JSON string) is committed to the client, the web settle route, and the flight script.

### Vercel deploy — RESOLVED

- Production live at https://finaltab.vercel.app (project root `apps/web`, `GROQ_API_KEY` + `KEEPERHUB_API_KEY` set server-side as encrypted env vars).

### KeeperHub CLI contribution — SHIPPED

- PR open: https://github.com/KeeperHub/cli/pull/95 (`--require-verified` + `--timeout` for `execute status`). Open, **not merged**; it will not be described as merged unless GitHub shows it merged.

### ElevenLabs voiceover — DONE

- Key provided; 8 scene mp3s generated to `proof-output/voiceover/` (gitignored). Storyboard in [demo-storyboard.md](demo-storyboard.md).

## STILL BLOCKED

### 1. Deploy gas: 231 gwei of Base Sepolia ETH (blocks contract deploy + live settle leg)

- The org wallet `0x7ae891ec51990684682a084381e97b59d787652b` holds zero native ETH. KeeperHub sponsors transfers but NOT contract-call gas; the CreateX deploy needs 0.000000231 ETH.
- Deploy simulation is already clean: gasEstimate 346625, predicted address `0xEaf9E9d90a080Fa01E7Eb671AFB5B3f0B445F013`, `wouldRevert: false`.
- Fix: send any dust of Base Sepolia ETH to the org wallet (a faucet claim to your own wallet + forward works). Then:
  1. `node scripts/first-flight.mjs --recipient 0x7ae891ec51990684682a084381e97b59d787652b --deploy`
  2. Put the deployed address in `apps/web/.env.local` and Vercel as `NEXT_PUBLIC_SETTLEMENT_CONTRACT`, redeploy.
  3. Live settle through the web app, ending in a real VERIFIED_SETTLED.
- Note: the settle leg is also a contract call, so the wallet needs gas for that too; a single faucet claim (0.05+ ETH typical) covers everything.

### 2. Supabase project credentials

- Schema complete at `supabase/migrations/0001_init.sql`, not applied anywhere.
- Fix: create a free Supabase project, fill `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (+ the two `NEXT_PUBLIC_*` values) in `apps/web/.env.local`, run the migration.
- Until then the app is stateless per session; core flow works without persistence.

## Pre-existing upstream noise (not ours, disclosed)

- KeeperHub/cli on Windows: 8 agentic-wallet/doctor tests fail on a CLEAN clone of main (looks like HOME vs USERPROFILE in test setup). Our package (`cmd/execute`) is green before and after our change.
