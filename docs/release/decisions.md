# Decisions

The choices that shaped FINALTab, each with the alternative that was rejected and why. Decisions
that were later proven wrong are marked as such rather than rewritten.

---

## 1. `receiveWithAuthorization`, not `transferWithAuthorization`

**Chosen:** every debtor signs EIP-3009 `receiveWithAuthorization` naming the settlement contract as
`to`.

**Rejected:** `transferWithAuthorization`, which names the creditor as `to`.

**Why.** USDC enforces `msg.sender == to` on the receive variant. A leaked `receive` signature is
therefore redeemable only by the settlement contract — by anyone, yes, but only into the contract
that immediately fans the money out atomically. A leaked `transfer` signature is redeemable by
whoever holds it. The two look nearly identical in a code sample and differ enormously under
adversarial pressure.

The README and `docs/submission.md` originally advertised the unsafe variant. That was a
documentation error against a correct implementation, and it was fixed.

## 2. Nonces derived from the ledger hash

**Chosen:** `nonce = keccak256(ledgerHash, debtor, amount)`.

**Rejected:** random nonces, or a per-account counter.

**Why.** It makes post-signing edits structurally impossible rather than policy-forbidden. Change
one line item after everyone has signed and the ledger hash changes, so every nonce changes, so
every signature is void. Nobody has to notice the edit and nobody has to enforce a rule. A random
nonce would have left "did the amounts change after I signed?" as a question the UI has to answer
honestly and a malicious host could answer dishonestly.

## 3. Two signatures per debtor, not one

**Chosen:** a FINALTab plan-consent signature plus the USDC `receiveWithAuthorization` signature.

**Rejected:** collapsing to a single signature for a smoother demo.

**Why.** They authorize genuinely different things. One says "this split is correct"; the other says
"this contract may pull this exact amount from me". Collapsing them would make the demo look
slicker and the consent model weaker, and would make "one signature to settle" a claim the protocol
does not actually support. A smoother demo is not worth an untrue claim about what the user agreed
to.

## 4. Money is integer minor units, everywhere, always

**Chosen:** integers only. USD 2dp minor units scale to USDC 6dp minor units at ×10⁴.

**Rejected:** floats or decimal strings at any layer.

**Why.** The invariants `sum(shares) == total` and `sum(net positions) == 0` must hold exactly, and
float arithmetic makes exactness a matter of luck. This is enforced across 52 engine tests.

## 5. Non-USD ledgers are not settleable

**Chosen:** a GBP or EUR ledger renders **"SPLIT ONLY — NOT SETTLEABLE ONCHAIN"** and the settle
path is disabled.

**Rejected:** mapping non-USD currencies to USDC 1:1 so more receipts reach the demo's happy path.

**Why.** A 1:1 map of £ to USDC is not a rounding shortcut, it is silently moving the wrong amount
of money. There is no FX oracle in this project, and inventing a rate to keep a demo flowing would
make every non-USD settlement quietly incorrect. Splitting still works; only settlement is gated.

## 6. The model never decides anything that costs money

**Chosen:** the LLM proposes an allocation. It cannot choose payers, recipients, amounts, token,
chain, addresses, nonce, or execution timing — those are computed deterministically or supplied by
the user.

**Rejected:** letting the model emit a settlement payload directly.

**Why.** Model output is a suggestion under review, not an instruction. Every proposal is reconciled
against the deterministic engine before a human sees it, and the engine — not the model — produces
the numbers that get signed.

## 7. Simulate is a hard precondition, and a failed simulate is shown as a failure

**Chosen:** `simulate: true` runs before every execute and must return `success === true`. When it
would revert, the UI says **"WOULD REVERT — NOT BROADCAST"**.

**Rejected:** falling back to the previously verified receipt so the demo always shows a green
settlement.

**Why.** This is the decision the whole submission rests on. A cached receipt replayed as if it were
live is a fabricated result. The project currently *cannot* complete the settle leg — and the honest
render of that fact is now the most load-bearing thing in the demo.

Worth recording: for the contract deploy, **simulation passed and execution still failed**.
Simulation does not model the relayer's own native-token balance. Simulate is a necessary gate, not
a sufficient one.

## 8. Chain-verify the receipt instead of trusting the status field

**Chosen:** after KeeperHub reports success, independently confirm the receipt on chain and record
`verified` and `receiptStatus`.

**Rejected:** treating `status: "completed"` as proof.

**Why.** "The API said it worked" and "the chain says it worked" are different claims. Only the
second is evidence. Both recorded executions carry `verified: true` and `receiptStatus: "success"`
from a chain query, not from KeeperHub's own word.

## 9. Honor the server's pacing rather than inventing a retry policy

**Chosen:** obey `X-Poll-Interval-Hint` exactly (0 means terminal, stop) and pause exactly as long
as a 429's `Retry-After` says.

**Rejected:** a fixed poll interval with exponential backoff.

**Why.** The server knows its own load. A client that polls faster than asked is the reason rate
limits exist. No live 429 was ever triggered, which is the intended outcome rather than a coverage
gap.

## 10. Idempotency conflicts with a null `originalExecutionId` throw

**Chosen:** `idempotency_in_progress` retries with a bound of 5; `idempotency_conflict` **with** an
`originalExecutionId` returns that id to poll; `idempotency_conflict` with a **null** id throws with
canonicalization guidance.

**Rejected:** retrying the null case.

**Why.** A null conflict means the same key was reused with a *different body*. Retrying would
either duplicate a payment or overwrite an intent. Throwing is the only safe branch, so it throws
loudly instead of guessing.

## 11. Test counts are reported; coverage percentage is not

**Chosen:** report 200 passing / 1 skipped, measured.

**Rejected:** asserting the 80% coverage standard without running coverage.

**Why.** The house standard is 80% and it has not been measured here. Publishing an unmeasured
percentage to satisfy a checklist would be exactly the kind of claim this project spent its last
pass deleting. The gap is recorded in [gates.md](gates.md) as NOT MEASURED.

## 12. Skip the Groq-dependent test rather than mock it into the pass count

**Chosen:** one `packages/vision` test is skipped when no live `GROQ_API_KEY` is present.

**Rejected:** mocking it so the suite reads a round 155 passing.

**Why.** A mocked test counted as a pass inflates the number that judges will read. One visible skip
is cheaper than an inflated total.

## 13. Blocked states stay in the demo video

> **Superseded 2026-08-10.** The blocker this decision worked around (no deployed contract, no
> funded signers) was closed the same day, so the master was re-recorded with the real thing: the
> 101.6s cut shows a LIVE KeeperHub settlement executing on camera through to VERIFIED SETTLED
> (tx `0xac6d32e5…7c8710`, block 45312815). The principle stands — nothing was edited around or
> faked; the honest state simply changed from "blocked" to "working". Decision kept for history.

**Chosen:** the 92.7s master was recorded in one continuous session against the real app, with the
blocked settle state left in.

**Rejected:** editing around the blocked state, or re-shooting against fixtures.

**Why.** The video's job is to show what the product does. Cutting the one place it cannot deliver
would make the recording a different claim than the software supports.

---

## Decisions that were wrong

**"The Sign button is silently failing."** Recorded as a P0 blocker in several documents. Live
browser testing disproved it — the button works and produces valid signatures. The real defect
nearby was a React crash on the Simulate path, from an untyped `await res.json()` flowing into
`string`-typed state. Fixed; 11 call sites now route through `apps/web/lib/apiText.ts`, locked by 20
tests.

**The OpenAI fallback requested `gpt-4-vision`.** Not a served model id, so that leg would have
failed on its first real call. Corrected to `gpt-4o`, overridable via `OPENAI_VISION_MODEL`. The fix
is reasoned, not measured — that leg still has no key and has never contacted the live API.

**Two of five LLM-fallback tests asserted nothing about the code under test.** They passed while
testing their own mocks. Rewritten as 12 real cascade tests; the vision package went 25 → 32.

**A plaintext deployer key and a plaintext Alchemy key.** Both redacted, `hardhat.config.js` made
env-driven. This entry originally read "both remain in history at `1f20560`". That was wrong. A walk
of all 190 blobs in the object database found both keys in **unreachable** objects only and in none
of the 305 reachable ones — so neither is in any commit, and neither survives a clone. The right
remediation is `git gc --prune=now`, not the history rewrite this doc used to imply; rotating the
Alchemy key remains a user action.
