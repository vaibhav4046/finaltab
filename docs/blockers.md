# Honest blocker list

Everything below needs YOU (credentials or approval). Nothing here is faked in the app: blocked paths render as blocked, unproven states render as unproven.

## 1. KeeperHub ORGANIZATION key (blocks the whole live-settlement leg)

- The provided key is `wfb_` (user key). Direct execution endpoints return **401** with it; proven on this machine.
- Fix: KeeperHub dashboard, Settings > API Keys > **Organisation** tab, mint a `kh_` key, put it in `apps/web/.env.local` as `KEEPERHUB_API_KEY`.
- The script is WRITTEN and waiting at `scripts/first-flight.mjs` (refuses `wfb_` keys up front, simulate-first everywhere, fail-closed receipt verification, exit codes 0/1/2/3). Once the key is in place:
  1. `node scripts/first-flight.mjs` — auth probe, chain sanity, zero-value sponsored self-transfer: simulate -> execute -> verified receipt.
  2. `node scripts/first-flight.mjs --deploy` — same plus FinalTabBatchSettlement deploy via CreateX `deployCreate(initCode)` (CreateX at `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`); the deployed address comes from the ContractCreation event on BaseScan, then goes into `NEXT_PUBLIC_SETTLEMENT_CONTRACT`.
  3. Real simulate/execute/status through the web app, ending in a real VERIFIED_SETTLED with a receipt.
- This mirrors KeeperHub/cli issue #47 (kh_ vs wfb_ prefix confusion): our own onboarding pain, and part of why the CLI contribution targets verification UX.

## 2. Supabase project credentials

- Schema is complete at `supabase/migrations/0001_init.sql`, not applied anywhere.
- Fix: create a free Supabase project, fill `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (+ the two `NEXT_PUBLIC_*` values) in `apps/web/.env.local`, run the migration in the SQL editor or via `supabase db push`.
- Until then the app is stateless per session; core flow works without persistence.

## 3. Vercel deploy (needs your approval, it is a public action)

- `apps/web` production build is green locally. Deploying publishes it; say the word and it goes up on the free tier with env vars set server-side.

## 4. KeeperHub CLI push + PR (needs your approval, public action)

- Branch `feat/execute-status-require-verified` @ `c4602cf` sits in `D:\project\keeperhub-cli`, tests green, PR body drafted in [keeperhub-cli-pr-draft.md](keeperhub-cli-pr-draft.md).
- Fix: approve; then fork KeeperHub/cli under your account, push, open the PR. It will not be described as merged unless GitHub shows it merged.

## 5. ElevenLabs key (demo voiceover, optional)

- Never provided. Demo storyboard is written to work with or without voiceover.

## Pre-existing upstream noise (not ours, disclosed)

- KeeperHub/cli on Windows: 8 agentic-wallet/doctor tests fail on a CLEAN clone of main (looks like HOME vs USERPROFILE in test setup). Our package (`cmd/execute`) is green before and after our change.
