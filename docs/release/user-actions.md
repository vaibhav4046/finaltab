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
| 5 | Render/upload the V2 video and submit to DoraHacks | Account and publication actions | High | Submission itself |
| 6 | Rotate the Alchemy API key | Rotating a credential is never autonomous | Medium | Nothing functional — the repo no longer needs it |
| 7 | Optionally authorize a paid Privy Custom Authentication plan in the future | The authenticated dashboard showed Custom Authentication on Scale ($499/month) and production activation requested payment details; the current instruction is stop before charge | Low | Optional linked-wallet provisioning only; core Supabase Auth/RLS remains complete |
| 8 | Provide a verified sender domain and configure custom SMTP or a Send Email Hook | Supabase default mail cannot prove the requested branded inbound email | Medium | Branded authentication email; the branded return page already exists |

## Resolved with explicit authorization on 2026-08-11

- V2 value proof: KeeperHub execution `3hmlqi36zweiwg6fc5o2u`, tx
  `0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789`,
  block `45327128`, exactly `1` atomic USDC, with verified receipt, exact V2
  event binding, and conserved balances. Do not rebroadcast it.
- Supabase: `finaltab-production` (`yoavihmldqbkuxinrsih`), London `eu-west-2`,
  free plan; four baseline plus additive `52236`, `60000`, `64822`, `73000`, and
  `74000` migrations applied. All 29 public tables have RLS, sensitive mutation
  RPCs are service-role-only, advisors report no errors, and the unindexed-FK
  warning is cleared. Post-promotion cutover `74500` is not applied. Final
  application deployment and cross-device behavior remain separate release
  gates.

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

## 3. Supabase project — resolved infrastructure, behavior probe pending

`finaltab-production` is active under project ref `yoavihmldqbkuxinrsih` in
London (`eu-west-2`) on the free plan. The four baseline plus five ordered
additive migrations are applied remotely, including
`20260811060000_cover_agent_event_composite_fk.sql`. Schema verification found
29/29 public tables with RLS. Sensitive new mutation RPCs deny `PUBLIC`, `anon`,
and `authenticated` and allow `service_role`; advisors report no errors and the
unindexed-FK warning is cleared. Public production configuration is prepared
without exposing a service-role value.

The remaining action is a final deployment plus multi-identity browser probe.
Until that passes, describe the project and schema as provisioned, but do not
claim that cloud tabs, invitations, approvals, history, or cross-device resume
have been exercised live.

The agent-control schema migration is applied, but HMAC provenance,
stale-review invalidation, tenant isolation, and cross-device behavior must be
rechecked through the candidate deployment before the agent control plane is
called production-live. Migration `20260811074500` remains a separate
post-promotion cutover.

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

## 5. Submission actions

Explicitly outside autonomous scope, per the operating constraints for this work:

- Submit the entry on DoraHacks.
- Publish/open the KeeperHub CLI PR.
- Render and upload the new V2 agent/MCP video from that same proof package,
  then record its real public URL in `docs/submission.md`.

`docs/submission.md` deliberately says the V2 URL is pending. Do not replace
that state until the uploaded link works while logged out, and do not submit
with it hand-waved.

---

## 6. Alchemy API key

A live Alchemy API key was hardcoded in four files, including
`CLAUDE-EXTENSION-SETUP.md`, which a judge would plausibly read. All four are
redacted in the working tree:

- `contracts/hardhat.config.js` — now `process.env.BASE_SEPOLIA_RPC_URL`, falling
  back to the public `https://sepolia.base.org` endpoint. Contract tests still
  pass (11/11) after the change, because they run against the local Hardhat
  network.
- `deploy.cmd`, `CLAUDE-EXTENSION-SETUP.md`, `proof-template.json` — placeholder
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
