# FINALTab finalist pitch

## One-line positioning

FINALTab is a proof-carrying settlement rail for shared expenses: AI interprets
the receipt, deterministic code reconciles every cent, external wallets consent,
KeeperHub executes, and independent chain proof closes the tab.

## Judge links

- Product: [finaltab.vercel.app](https://finaltab.vercel.app/)
- 90-second film: [YouTube](https://youtu.be/eXZACnOdt5w)
- DoraHacks: [FINALTab BUIDL #47656](https://dorahacks.io/buidl/47656)
- Repository: [vaibhav4046/finaltab](https://github.com/vaibhav4046/finaltab)
- Retained Base Sepolia proof: [transaction `0x7a6fb760…a789`](https://sepolia.basescan.org/tx/0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789)
- KeeperHub onboarding contribution: [CLI PR #95](https://github.com/KeeperHub/cli/pull/95)

## Three-minute talk track

### 0:00–0:25 — Hook

“A receipt is easy to read. The dangerous part is turning it into money without
letting a model invent cents, hold user keys, or mistake a transaction hash for
success. FINALTab turns a shared receipt into an exact, wallet-approved USDC
settlement—and refuses to call it settled until KeeperHub and an independent
Base Sepolia check prove it landed.”

### 0:25–0:55 — Product

“Here is the complex case from our film: a $172.04 receipt, 19 lines, and eight
participants, with weights, exclusions, shared charges, and a payer correction.
AI structures the intent. Deterministic code converts everything to integer
minor units and uses largest-remainder allocation so the shares reconcile
exactly. Four stages review receipt validity, arithmetic, consent risk, and
proof readiness. Change anything upstream, and the review is invalidated.”

### 0:55–1:25 — Safety architecture

“Freeze creates canonical ledger and payout-plan hashes. Every debtor’s external
wallet must sign both the USDC authorization and consent to the complete plan.
The server does not hold participant keys. The production design then simulates
the exact call through KeeperHub, requires a short-lived human broadcast
approval, and records execution through one durable, idempotent journal.”

### 1:25–1:55 — Real proof

“We retained a separate, explicitly authorized KeeperHub V2 settlement on Base
Sepolia. Execution `3hmlqi36zweiwg6fc5o2u` landed in block `45327128`. It moved
exactly one atomic USDC unit: debtor minus one, creditor plus one, contract zero,
conservation delta zero. KeeperHub reported a verified successful receipt, and
our independent RPC check matched the exact `SettlementExecuted` event.”

### 1:55–2:25 — MCP and developer experience

“Our authenticated production MCP endpoint exposes exactly nine tools for
calculation, preparation, execution safety, and proof. The filmed MCP test
initialized the server, listed all nine tools, allocated the complex receipt,
prepared V2 wallet requests, and created the approval challenge—then deliberately
stopped. It made no signature, submission, broadcast, or value movement. The
retained KeeperHub settlement is separate.”

### 2:25–2:45 — Onboarding contribution

“We also submitted KeeperHub CLI PR #95. Its `--require-verified` option lets
agents and CI fail closed when an execution is merely completed but lacks a
verified successful receipt. The PR is open and unmerged.”

### 2:45–3:00 — Close

“FINALTab is testnet-only today, and the optional interactive voice lifecycle is
configured but not live-proven. We are precise about those limits because that
is the product thesis: AI can interpret, but proof—not optimism—must decide when
money has moved.”

## Five-minute extension

After the product section, add:

“The model proposes structured intent. From that point onward, money is
deterministic. Decimal strings become integer minor units. Largest-remainder
allocation guarantees that every share sums to the receipt total. The debt graph
is netted deterministically to at most `n−1` transfers; we do not claim the greedy
result is globally minimal.”

After the architecture section, add:

“Consent binds creditors, payouts, contract, chain, nonce, and expiry. If a
signature is invalid, stale, replayed, or attached to a mutated or imbalanced
plan, the atomic batch reverts. Voice remains outside this boundary: it may help
enter or read back text, but it cannot allocate, sign, approve, submit, or
broadcast value.”

Before the close, add:

“The live product includes GitHub OAuth and durable tab create/read. The V2
contract has an exact Sourcify creation/runtime match. The public MIT monorepo
contains the application, deterministic engine, Solidity contract, KeeperHub
client, MCP surface, migrations, tests, workflow export, and evidence package.”

## Live-demo runbook

Target: 90 seconds. Keep the browser at 100% zoom and preload every route.

1. Open `https://finaltab.vercel.app/` and state the one-line positioning.
2. Enter the authenticated workspace and show the durable tab boundary.
3. Open **Agents & memory**. Point to the real Input → Extraction → Allocation
   → Consent risk → Proof readiness lineage and bounded memory record.
4. Open **Developers**. Show the nine-tool manifest; explain that the filmed MCP
   session stops at the approval challenge.
5. Open the retained proof image or BaseScan transaction. State clearly:
   “Earlier authorized run, separate from the filmed MCP test.”
6. End on the transaction block and exact conservation result.

Never attempt a wallet signature, simulation, submission, or broadcast during
the pitch.

## Demo fallbacks

- If production is slow: use the real screenshots embedded in the pitch deck.
- If authentication expires: show the public Developers page and retained proof.
- If BaseScan is slow: show the retained proof plate, then give the transaction
  URL verbally.
- If audio fails: continue from the deck; every proof claim is visible.

## Evidence numbers to memorize

- Complex task: `$172.04`, `19` lines, `8` participants.
- MCP surface: exactly `9` authenticated tools.
- Retained KeeperHub execution: `3hmlqi36zweiwg6fc5o2u`.
- Base Sepolia transaction: `0x7a6fb760…a789`.
- Block: `45327128`.
- Settlement value: `1` atomic USDC unit (`0.000001 USDC`).
- V2 contract: `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`.

## Truth guardrails

Always say:

- retained KeeperHub settlement;
- filmed non-value MCP test;
- configured, not live-proven voice;
- open, unmerged PR #95;
- Base Sepolia testnet.

Never say:

- the MCP agent broadcast the settlement;
- voice is fully live;
- mainnet-ready;
- PR #95 was merged;
- a transaction hash alone proves success.
