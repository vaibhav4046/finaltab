# USER ACTION REQUIRED

The active rows in this file need a human. The previously authorized V2
one-atomic-unit settlement and free Supabase provisioning are retained below as
resolved audit records, not repeated requests.

Nothing below is a code defect. The code paths for all of these exist and are
tested; they are gated on inputs only a human can supply.

| # | Action | Why it needs you | Severity | Blocks |
|---|---|---|---|---|
| 1 | Purge a deployer private key from **unreachable** objects in your local `.git` | Deleting git objects is irreversible | Low | Local disk hygiene. Not reachable from any commit, so not exposed by clone or push |
| 4 | Optionally publish V2 source on BaseScan | Sourcify exact match is already proven; BaseScan requires its own account/API flow | Low | BaseScan-native readability only |
| 6 | Rotate the Alchemy API key | Rotating a credential is never autonomous | Medium | Nothing functional — the repo no longer needs it |
| 7 | Optionally authorize a paid Privy Custom Authentication plan in the future | The authenticated dashboard showed Custom Authentication on Scale ($499/month) and production activation requested payment details; the current instruction is stop before charge | Low | Optional linked-wallet provisioning only; core Supabase Auth/RLS remains complete |
| 8 | Provide a verified sender domain and configure custom SMTP or a Send Email Hook | Supabase default mail cannot prove the requested branded inbound email | Medium | Branded authentication email; the branded return page already exists |

## Resolved with explicit authorization on 2026-08-11

- V2 value proof: KeeperHub execution `3hmlqi36zweiwg6fc5o2u`, tx
  `0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789`,
  block `45327128`, exactly `1` atomic USDC, with verified receipt, exact V2
  event binding, and conserved balances. Do not rebroadcast it.
- Supabase: `finaltab-production` (`yoavihmldqbkuxinrsih`), London `eu-west-2`,
  free plan; baseline/additive, financial-cutover, and owner-select migrations
  applied. All 31 public tables have RLS; sensitive mutation RPCs and legacy
  direct writes deny browser roles. Advisors report zero error-level findings with reviewed
  warnings remaining. Canonical GitHub OAuth/reload and an authenticated owner
  tab create/read passed; multi-identity/cross-device behavior remains separate.

---

## 1. Deployer private key in unreachable git objects

> **This section was materially wrong until 2026-08-10 and is corrected in place.**
> It previously told you — and any judge reading it — that the key was committed
> at `1f20560` and that "anyone who clones the repo can recover it with
> `git show 1f20560:SUBMISSION.md`". That command was run. It returns no key.
> The corrected finding is below. The correction cuts both ways: the key is real
> and it is on this machine, but it is not in the published repository.

**What happened.** A raw 64-hex `DEPLOYER_PRIVATE_KEY` literal was pasted into
copy-paste deploy instructions in six files. It has been removed from all of them
in the working tree, replaced with `"<your-deployer-private-key>"`.

**Where it actually lives.** Measured 2026-08-10 by walking the entire git object
database, not just the commit graph:

| measurement | command | result |
|---|---|---|
| objects reachable from all refs | `git rev-list --objects --all` | 305 |
| unreachable / dangling objects | `git fsck --unreachable --dangling` | 38 |
| blobs in the object database | `git cat-file --batch-all-objects` | 190 |
| blobs containing the deployer key | per-blob scan of all 190 | **8, every one of them unreachable** |
| blobs containing an Alchemy key | per-blob scan of all 190 | **unreachable only** |
| reachable objects containing either key | cross-reference against `rev-list` | **0** |
| `git show 1f20560:SUBMISSION.md` | the recovery command this doc used to publish | no key; its only 64-hex token is the public Basescan tx hash |

Those 8 blobs are files that were staged or written into the object database and
then superseded before any commit took them. Git wrote the blob, no tree ever
referenced it, and it has sat unreferenced since.

**Why this is a local problem and not a published one.** Git transfers only
objects reachable from the refs being sent. `git clone`, `git fetch`, and
`git push` never walk dangling objects. A judge who clones
`github.com/vaibhav4046/finaltab` receives the 305 reachable objects and cannot
recover either credential from them by any means. The exposure is confined to
this working machine.

**The key is real, though.** It was derived locally — a one-way private-key →
address computation, no signing and no broadcast — and it controls
`0x976EF25623A94F6F70924816697C7c7172210a5F`, exactly the address this document
already named. So treat it as compromised-on-disk even though it is not
compromised-in-public.

**Measured blast radius — this is not a funds emergency.** Verified on Base
Sepolia on 2026-08-10:

| property | measured value |
|---|---|
| address the key controls | `0x976EF25623A94F6F70924816697C7c7172210a5F` |
| is it a well-known public test vector? | **No** — a real generated key |
| native ETH held | 0.00009666 (testnet dust) |
| USDC held | 0 |
| transaction count | 1 |
| what that 1 tx did | deployed the historical V1 contract (CREATE at nonce 0 = `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64`, matches exactly); it has no V2 authority |
| authority over the deployed contract | **None.** `FinalTabBatchSettlement.sol` has no owner, admin, pause, withdraw, sweep, upgrade, or selfdestruct function. There is nothing privileged to call. |

So the exposure costs at most 0.0001 testnet ETH and grants no control over
anything deployed. The real cost is credibility: a settlement project showing
judges a plaintext private key undercuts the security posture the rest of the
repo argues for.

**Your options, in the order I'd rank them:**

1. **Prune the unreachable objects.** This is the actual remediation, and it is
   local, fast, and does not touch a single commit:

   ```bash
   git reflog expire --expire-unreachable=now --all
   git gc --prune=now
   ```

   No commit hash changes, no rewritten history, nothing to force-push, nothing
   for a collaborator to re-clone. It deletes only objects that no tree
   references. Verify afterwards with `git fsck --unreachable | wc -l`.
2. **Never reuse the key regardless.** Treat `0x976EF2…` as permanently burned:
   never fund it again, never use it on mainnet, never reuse it for a second
   deploy. Do this whether or not you run step 1.
3. **`git filter-repo` is not needed and would be the wrong tool.** It rewrites
   commits to remove content *from* commits. No commit contains this key, so
   there is nothing for it to rewrite — it would churn every hash for no benefit.
   The earlier version of this document recommended it on a false premise.

I did not run step 1: deleting git objects is irreversible, and you may want to
inspect the dangling blobs yourself before they go.

---

## 2. Historical V1 signer funding — resolved 2026-08-10

> This section proves how the V1 demo signers were funded. It does not close
> the current V2 external-wallet settlement gate.

**Closed.** Persistent demo signers were added (env-keyed, stored in gitignored
`proof-output/demo-signers.local.json`), both debtors were funded 20 USDC each from the
Circle faucet, the relayer was funded 0.00005 ETH directly, and the settle leg ran live
to VERIFIED_SETTLED (tx `0x7bf655f3…45c12d`, block 45310631, 8.00 USDC moved atomically).
Evidence in `docs/release/evidence/`. The measurement below is preserved as the state
that made this a blocker — measured earlier on 2026-08-10:

```
debtor A (demo, session-generated)     USDC 0.000000   ETH 0.000000
debtor B (demo, session-generated)     USDC 0.000000   ETH 0.000000
KeeperHub relayer                      USDC 0.000000   ETH 0.000000
```

A settle attempt reverts with `Error(ERC20: transfer amount exceeds balance)`.

Three independent problems, all measured rather than assumed:

1. **Every account holds zero USDC.** Nothing can be pulled.
2. **The relayer holds zero native ETH.** KeeperHub sponsors transfers but not
   contract-call gas, so even funded debtors would not get the call mined.
   *(Post-fix annotation, 2026-08-10: this diagnosis was preserved as written,
   but the sponsorship half proved wrong — once the settle leg ran, every
   recorded execution reported `sponsored: true` with gas paid by KeeperHub's
   gas-payer EOA, measured via `eth_getTransactionByHash`. The relayer funding
   still happened and unblocked the deploy attempt path.)*
3. **The demo debtor keys are ephemeral.** `apps/web/lib/flow.ts:30` calls
   `generatePrivateKey()` per session — confirmed by reloading the page and
   watching entirely new addresses appear. **Any address you fund today is dead
   on the next page load.**

Because of (3), funding alone could not close this — it needed the persistent
signer strategy first, which is exactly what was built (fixed dev keypairs behind
the `NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS` opt-in flag, locked by 46 tests).

While it was open, the app refused to fake it: the settle path rendered as
blocked and the proof capsule stayed unproven rather than showing a replayed or
mocked receipt.

---

## 3. Supabase project — resolved infrastructure, bounded behavior proof

`finaltab-production` is active under project ref `yoavihmldqbkuxinrsih` in
London (`eu-west-2`) on the free plan. The baseline plus seven ordered additive,
financial-cutover, and owner-select migrations are applied remotely, including
`20260811060000_cover_agent_event_composite_fk.sql`,
`20260812023200_v3_narration_generation_journal.sql`, and
`20260812090000_durable_prefreeze_tab_drafts.sql`. Schema verification found
31/31 public tables with RLS. Sensitive new mutation RPCs deny `PUBLIC`, `anon`,
and `authenticated` and allow `service_role`; legacy direct writes and the old
voice RPC deny browser roles. Advisors report zero error-level findings, with reviewed
RLS/function and leaked-password-protection warnings remaining. Public
production configuration exposes no service-role value.

The canonical deployment passed GitHub OAuth/reload and a real authenticated
owner tab create/read, membership, participant add, and audit verification.
Until a multi-identity browser probe passes, do not claim that cross-tenant
invitations, approvals, shared history, or cross-device resume were live-tested.

The agent-control schema migration is applied, but HMAC provenance,
stale-review invalidation, tenant isolation, and cross-device behavior must be
separately exercised before the complete agent control plane is called
production-live. Migration `20260811074500` is applied; its browser-role denials
are verified.

---

## 4. V2 source publication

V2 at `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB` is already source-verified by
Sourcify with exact creation and runtime matches (match ID `43497805`). The
retained deployment manifest proves that state.

BaseScan publication is optional and must not be conflated with Sourcify. If a
BaseScan account/API key is available, publish the exact V2 compiler settings
and constructor input there for explorer-native readability. Until BaseScan
confirms it, submission copy must say “Sourcify exact match,” not “verified on
BaseScan.”

---

## 5. Submission state and follow-up

- [DoraHacks BUIDL 47656](https://dorahacks.io/buidl/47656) is submitted and
  `Under Review`; its Best Onboarding UX Improvement bounty application is saved.
- The verified public film is <https://youtu.be/eXZACnOdt5w> and its measured
  metadata and SHA-256 are recorded in the canonical submission documents.
- [KeeperHub CLI PR #95](https://github.com/KeeperHub/cli/pull/95) is open and
  unmerged and adds only `--require-verified`.

Monitor the review and PR states without upgrading either claim unless the
respective public service reports a change. The real production browser voice
lifecycle and production MCP human-approval/submission path remain separate,
unproven gates.

---

## 6. Alchemy API key

A live Alchemy API key was hardcoded in four files, including a local setup
note that a judge would plausibly read. All four are
redacted in the working tree:

- `contracts/hardhat.config.js` — now `process.env.BASE_SEPOLIA_RPC_URL`, falling
  back to the public `https://sepolia.base.org` endpoint. Contract tests still
  pass (11/11) after the change, because they run against the local Hardhat
  network.
- `deploy.cmd`, that local setup note, `proof-template.json` — placeholder
  `<YOUR_ALCHEMY_KEY>`.

As with the deployer key, the surviving copies are in **unreachable** objects
only — the key appears inside `base-sepolia.g.alchemy.com/v2/<key>` URLs in
dangling blobs, and in zero objects reachable from any ref. A clone of the public
repo does not contain it. The `git gc --prune=now` in section 1 clears these in
the same sweep.

Rotate it anyway. Unlike the deployer key, this one is a real service credential
on an account you own, it sat in plaintext on disk, and rotation is free and
non-destructive. "Probably never left this machine" is not a reason to keep a
live key that you already know was written down.

**Rotate it in the Alchemy dashboard.** Nothing in the repo depends on it any
more — the fallback RPC is public and unauthenticated. If you want the faster
Alchemy endpoint back, put the new key in `BASE_SEPOLIA_RPC_URL` in an untracked
`.env`, never in a tracked file.

I did not rotate it: rotating credentials is outside autonomous scope, and doing
it silently could break a deploy you had in flight.

---

## 7. Production browser voice lifecycle — capture done, transcript half open

**Capture is no longer blocked.** On 2026-08-14, in your signed-in Chrome with a
real granted microphone, the deployed settlement room was driven end to end:
permission `granted` with four labelled audio inputs, a first `Start listening`
that reached the budget layer and was refused with a live `429`
`VOICE_CONCURRENCY_LIMITED` (the reservation RPC allows one concurrent user
session on a 180-second lease), a `200` token mint once that lease expired, the
`LISTENING` state with `Stop` rendered, and a clean `Stop` that returned the
panel to `READY` and released the device — a subsequent independent
`getUserMedia` acquired a live track. No dictation was spoken, deliberately,
because AssemblyAI bills on streaming seconds.

`tests/e2e/voice-lifecycle.spec.ts` remains the probe for what that run did not
cover: capturing a live AssemblyAI transcript, pushing it through **Use
transcript**, and confirming the transcript stops at the instruction textarea
instead of reaching allocation. It also asserts the abort path leaves no stuck
control, and inspects the live `POST /api/voice/token` response for durable
quota headers and for any permanent provider key.

**It still cannot be run autonomously, but the reason has changed.**
`apps/web/lib/server/voiceQuota.ts` accepts only a principal whose `source` is
`session` or `bearer-jwt` with a UUID subject, so no machine or API token can
mint an AssemblyAI streaming credential. A live signed-in browser session exists
now, but it cannot be exported into a Playwright storage state from inside the
page: the app's `connect-src 'self'` CSP blocks both a blob download and a
loopback POST. Producing the file therefore needs the manual steps below.

**To run it yourself:**

1. Sign in to <https://finaltab.vercel.app> in a browser, then save that browser
   context as a Playwright storage state file (`pnpm exec playwright open
   --save-storage=voice-session.json https://finaltab.vercel.app`, sign in, then
   close the window). Keep the file untracked — it holds a live session.
2. Run the probe against production:

```bash
E2E_VOICE_STORAGE_STATE=./voice-session.json E2E_BASE_URL=https://finaltab.vercel.app pnpm exec playwright test tests/e2e/voice-lifecycle.spec.ts --project=chromium
```

The microphone is a Chromium fake device fed by the retained locally generated
Kokoro narration at
`video/finaltab-winner/assets/audio/voice-v3/source-local/scene-01-kokoro.wav`;
override it with `E2E_VOICE_FIXTURE_WAV`. A full run costs one AssemblyAI
streaming session per test. It never triggers a paid ElevenLabs readback, never
touches participant funds, and cannot broadcast anything — the probe stops at
the instruction textarea, and allocation stays gated on a confirmed receipt.

Until that run passes, hybrid voice stays at
`CAPTURE LIFECYCLE LIVE-PROVEN; READBACK PENDING`. Do not upgrade the claim on
the strength of the probe existing, and do not read the capture run above as
proof of transcript delivery or of an ElevenLabs synthesis request.
