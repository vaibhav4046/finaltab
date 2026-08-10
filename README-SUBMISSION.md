# FINALTab: Cryptographic Bill Settlement Platform
## KeeperHub Agents Onchain Hackathon Submission

**Status (measured 2026-08-10): code complete, contract deployed, KeeperHub execution live-proven,
batch settlement executed onchain three times — once ON CAMERA in the demo video.** Per-surface evidence labels are in
[docs/release/truth-snapshot.md](docs/release/truth-snapshot.md); this file summarises them.

---

## What Is FINALTab?

Deterministic bill splitting + cryptographic settlement on-chain.

User flow:
1. Upload receipt (photo)
2. AI extracts items + amounts (Groq Vision)
3. Allocate to participants (drag-drop UI)
4. Freeze ledger (canonical hash locks edits)
5. Sign transfers (EIP-712 ReceiveWithAuthorization)
6. Execute settlement on-chain (Base Sepolia)
7. Verify zero retained USDC (atomic settlement guarantee)

---

## Architecture

### Smart Contract (FinalTabBatchSettlement.sol)

```solidity
function executeSettlement(
  bytes32 settlementId,
  bytes32 ledgerHash,
  PullAuthorization[] pulls,  // Debtors sign via EIP-712
  Payout[] payouts           // Creditors receive USDC
)
```

**Safety guarantees:**
- Safe EIP-3009 pattern: `to` = settlement contract (prevents nonce extraction)
- Nonce binding: `keccak256(ledgerHash, debtor, amount)` (prevents replay across settlements)
- Atomicity: All pulls + payouts succeed together OR entire settlement reverts
- Zero retained: Contract balance before == after (verified onchain)

**Test coverage:** 11/11 passing
- Executes multi-pull settlement atomically
- Reverts whole batch if one signature invalid
- Reverts whole batch if one debtor insufficient balance
- Rejects reused settlementId
- Rejects settlementId not derived from ledgerHash
- Prevents nonce replay even in different settlement
- Rejects expired/not-yet-valid authorizations
- Anyone can execute (executor irrelevant)

### Engine (TypeScript)

EIP-3009 ReceiveWithAuthorization implementation:
- Typed data signing (EIP-712)
- Nonce derivation + replay protection
- Settlement verification

**Test coverage:** 52/52 passing

### Web App (React + Next.js)

**ExecutionRail component** — settlement state machine:
1. `doFreeze()` → canonicalizes ledger, computes hash, locks edits
2. `doSign()` → signs ReceiveWithAuthorization for each debtor
3. `doSimulate()` → KeeperHub dry-run, checks would-revert
4. `doExecute()` → broadcasts to Base Sepolia
5. `doPolling()` → polls for tx confirmation

**Features:**
- Groq→Claude→OpenAI fallback routing. The cascade is covered by 12 tests that drive the real
  router with each SDK mocked at the module boundary. **Only the Groq leg has ever contacted a real
  API** — no Claude or OpenAI key is configured, so those two legs are tested, not proven.
- OCR receipt parsing (image → items + amounts), live against Groq
- Mobile responsive (Framer Motion animations)
- Supabase persistence: schema written, **not applied**. No credentials, nothing persisted, the app
  is stateless per session.
- KeeperHub direct execution (no centralized backend)

**Build status:** Clean, no TypeScript errors ✓

---

## Deployment

### Prerequisites

**This section is historical.** The contract is already deployed at
`0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` and its bytecode is confirmed on chain. You do not need
to repeat these steps to run or judge the project. They are kept so a redeploy is reproducible.

1. **Fund a deployer account** (0.1+ ETH on Base Sepolia) from any Base Sepolia faucet. Supply the
   key through `DEPLOYER_PRIVATE_KEY` in an untracked `.env` — never in a tracked file. The key used
   for the original deploy was committed by mistake, is burned, and must not be reused.

2. **RPC endpoint.** `contracts/hardhat.config.js` reads `BASE_SEPOLIA_RPC_URL` and falls back to
   the public `https://sepolia.base.org`. An Alchemy key was previously hardcoded here; it has been
   removed and should be rotated. Nothing in the repo depends on it.

### Deployment Command

```powershell
# Supply your own key. A previous revision of this file pasted the actual
# deployer key here in plaintext; it is burned and must never be reused.
$env:DEPLOYER_PRIVATE_KEY = "<your-deployer-private-key>"
cd D:\project\finaltab
node scripts/finaltab-cli.js
```

**Output:**
- Deploys FinalTabBatchSettlement to Base Sepolia
- Saves contract address to `.env.local`
- Verifies all tests passing
- Generates proof template
- Prints settlement flow instructions

### Live Settlement

```bash
cd D:\project\finaltab\apps\web
pnpm dev  # Start dev server (http://localhost:3000/app/tab)
```

Then in browser:
1. Upload receipt
2. Allocate amounts
3. Freeze ledger
4. Sign transfers
5. Simulate settlement
6. Execute on-chain
7. Verify zero retained USDC

---

## Proof Collection

After settlement executes on-chain:

```json
{
  "transactionHash": "0x...",
  "blockNumber": 12345,
  "events": [
    {"name": "SettlementExecuted", "args": {...}},
    {"name": "PullExecuted", "args": {...}},
    {"name": "PayoutExecuted", "args": {...}}
  ],
  "balances": {
    "before": 0,
    "after": 0,
    "retained": 0
  }
}
```

**Evidence:**
- Contract address on Etherscan
- Transaction receipt + gas used
- Event logs (all pulls + payouts)
- Final balance verification

---

## Submission Files

1. **proof.json** — On-chain execution evidence
2. **proof-output/finaltab-demo.mp4** — 1:42 flow demonstration recorded live against the running app: Groq extraction, plain-English allocation, freeze, EIP-3009 signing, simulation, and a REAL KeeperHub settlement executing on camera through to the VERIFIED SETTLED banner with the raw status JSON (tx `0xac6d32e5…7c8710`, block 45312815) on screen
3. **SUBMISSION.md** — Technical summary
4. **Repository** — vaibhav4046/finaltab (all source code)

---

## Key Technical Decisions

### Why EIP-3009 ReceiveWithAuthorization (Not TransferWithAuthorization)?

**Safety:**
- TransferWithAuthorization: Debtor's signature includes creditor as `to` field
  - Risk: If attacker extracts signature, can replay it to different creditor
- ReceiveWithAuthorization: Settlement contract is always `to` field
  - Safe: Nonce binds to (ledgerHash, debtor, amount) only
  - Replay attack impossible: Changing settlement voids all nonces

### Why Nonce Binding to ledgerHash?

Settlement data locked in canonical hash. If ANY participant edit after freeze:
- Hash changes
- All pre-signed nonces become invalid
- Settlement cannot execute
- Prevents manipulation during execution window

### Why Atomic Batching?

All-or-nothing guarantee for multi-participant settlements:
- Either everyone's transfer succeeds AND everyone receives
- OR entire settlement reverts (no partial execution, no orphaned credits)
- Prevents coordination gaps (e.g., A pays but doesn't receive)

---

## Test Results

Measured 2026-08-10 by running each suite:

```
engine            52 passed
keeperhub         32 passed
vision            32 passed, 1 skipped (needs a live GROQ_API_KEY)
flight-recorder    7 passed
web               78 passed
contracts         11 passing   (npx hardhat test)
------------------------------------------
                 212 passing, 1 skipped
```

No coverage percentage is claimed, because no coverage run has been performed.

Contract is **deployed** at `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` — 2259 bytes confirmed via
`eth_getCode`. Source is not yet verified on Basescan.

---

## What Makes This Production-Grade?

1. **Cryptographic Safety** — EIP-712 typed data, nonce binding, atomic settlement
2. **Real Chain Execution** — `executeSettlement` has moved real USDC on Base Sepolia four times
   through KeeperHub with chain-verified receipts (tx `0x7bf655f3…45c12d` block 45310631, tx
   `0x770ada77…f120fc2` block 45311736, tx `0xac6d32e5…7c8710` block 45312815 — live on camera in
   the demo video — and tx `0x314189b4…c5eb` block 45315909, driven end-to-end by an AI agent over
   MCP in five JSON-RPC calls, <3s). Earlier zero-value rail proof: tx `0x1130...278c`.
3. **Resilience** — Groq→Claude→OpenAI fallback routing, cascade covered by 12 tests. Groq is the
   only leg proven against a live API.
4. **User Experience** — Mobile responsive, real-time feedback, animation
5. **Code Quality** — 212 passing tests, 1 skipped (201 workspace + 11 contract)
6. **Zero Trust Architecture** — No centralized backend (KeeperHub direct execution)
7. **Honest Defaults** — No fake data, no simulated users, real on-chain proof

---

## Status Checklist

- [x] Contract written + tested (11/11)
- [x] Engine implemented + tested (52/52)
- [x] Web app UI complete + responsive
- [x] KeeperHub integration working, live-proven end to end
- [x] LLM fallback cascade covered by 12 tests — Groq leg live, Claude and OpenAI legs never
      contacted their real APIs
- [x] Contract deployed to Base Sepolia (`0xCcf6b4De…`, code confirmed on chain)
- [x] Proof collected — live settlement tx `0x7bf655f3…45c12d`, executionId `dthckv3julum6m5ktmdik`, `verified: true`; earlier rail proof tx `0x1130...278c` (`g0w11wukbk1v0psyditx4`)
- [x] Demo video recorded (`proof-output/finaltab-demo.mp4`, 101.6s, re-recorded 2026-08-10 with a
      LIVE settlement on camera — tx `0xac6d32e5…7c8710`, block 45312815)
- [ ] Contract source verified on Basescan
- [x] `executeSettlement` executed onchain — 2026-08-10: 8.00 USDC moved atomically on Base Sepolia
      (tx `0x7bf655f3…45c12d`, block 45310631, chain-verified, exact balance deltas). The earlier
      blocker (zero USDC in demo accounts, zero native ETH in the relayer) was closed the same day
      via the Circle faucet and a direct relayer top-up. Report in `docs/release/evidence/`.
- [ ] Supabase schema applied (no credentials; app is stateless)
- [ ] KeeperHub CLI PR published
- [ ] Video uploaded
- [ ] Submitted to hackathon

---

## How to Get Funded (Workaround)

If faucets blocked:
1. Use existing wallet with mainnet ETH
2. Bridge small amount to Base Sepolia (official bridge)
3. Or: Request testnet ETH from community (Discord/forum)

Then run deployment CLI once funded.

---

## Repository

**GitHub:** https://github.com/vaibhav4046/finaltab

All source code open. Inspect:
- `contracts/contracts/FinalTabBatchSettlement.sol` — main settlement logic
- `contracts/test/FinalTabBatchSettlement.test.js` — comprehensive test suite
- `packages/engine/src/eip3009.ts` — EIP-712 typed data + signing
- `apps/web/components/ExecutionRail.tsx` — settlement state machine
- `apps/web/lib/flow.ts` — signing + settlement orchestration

---

## Contact

**Submission:** KeeperHub Agents Onchain Hackathon (2026)
**Author:** Vaibhav Lalwani
**Email:** vaibhavlalwani26969@gmail.com

---

**Deployed and live. What remains is submission, video upload, and PR publication — all of which
are the author's actions, not the code's.** Every settlement claim above is backed by a
chain-verified receipt; nothing is papered over with a replayed or fabricated one.
