# USER ACTION REQUIRED

Everything in this file needs a human. Each row is here because it requires a
credential, a funded key, a destructive git operation, or an account action that
must not be taken autonomously — not because it was too hard to finish.

Nothing below is a code defect. The code paths for all of these exist and are
tested; they are gated on inputs only a human can supply.

| # | Action | Why it needs you | Severity | Blocks |
|---|---|---|---|---|
| 1 | Purge a deployer private key from **unreachable** objects in your local `.git` | Deleting git objects is irreversible | Low | Local disk hygiene. Not reachable from any commit, so not exposed by clone or push |
| 2 | Provide a persistent funded signer strategy for Base Sepolia | Needs a funded key + a product decision | High | The live settle leg |
| 3 | Create a Supabase project and fill 4 env vars | Requires an account you own | Medium | Persistence across sessions |
| 4 | Verify the contract source on Basescan | Requires a Basescan account/API key | Low | Human-readable tx for judges |
| 5 | Submit to DoraHacks, publish the CLI PR, upload the demo video | Explicitly out of autonomous scope | High | Submission itself |
| 6 | Rotate the Alchemy API key | Rotating a credential is never autonomous | Medium | Nothing functional — the repo no longer needs it |

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
| what that 1 tx did | deployed the live settlement contract (CREATE at nonce 0 = `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64`, matches exactly) |
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

## 2. Persistent funded signer on Base Sepolia

This is the only thing standing between the app and a live end-to-end settlement.
It is **not** a faucet top-up. Measured on 2026-08-10:

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
3. **The demo debtor keys are ephemeral.** `apps/web/lib/flow.ts:30` calls
   `generatePrivateKey()` per session — confirmed by reloading the page and
   watching entirely new addresses appear. **Any address you fund today is dead
   on the next page load.**

Because of (3), funding alone cannot close this. It needs a persistent signer
strategy first — either a fixed dev keypair loaded from env, or an injected
browser wallet — and that is a product decision, not a transfer.

Until it is closed, the app refuses to fake it: the settle path renders as
blocked and the proof capsule stays unproven rather than showing a replayed or
mocked receipt.

---

## 3. Supabase project

Schema is complete at `supabase/migrations/0001_init.sql` and applied nowhere.

Create a free project, then fill in `apps/web/.env.local`:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (server-only — must **not** carry a `NEXT_PUBLIC_` prefix)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then run the migration. Until then the app is stateless per session; the core
flow works without persistence.

---

## 4. Verify the contract on Basescan

`0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` has bytecode but no published
source. Two consequences:

- KeeperHub cannot auto-fetch the ABI, which is why
  `apps/web/lib/server/settlement.ts` must pass `abi` inline (and therefore uses
  the bare `functionName`, not the canonical signature).
- A judge following the tx link sees raw calldata instead of a readable call.

Verifying the source removes both.

---

## 5. Submission actions

Explicitly outside autonomous scope, per the operating constraints for this work:

- Submit the entry on DoraHacks.
- Publish/open the KeeperHub CLI PR.
- Upload the demo video and fill `[VIDEO_URL]` in `docs/submission.md`.

`docs/submission.md` still contains `[VIDEO_URL]` as a deliberate placeholder.
Do not submit with it hand-waved.

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
