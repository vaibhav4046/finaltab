# FINALTab Architecture Map

**Gate 0 Inventory — 2026-08-10**

## High-Level Flow

```
Receipt → Extract (Groq) → Allocate (NL→Engine) → Freeze (Hash) → 
Sign (EIP-712) → Simulate (KeeperHub) → Execute (KeeperHub) → 
Verify (RPC) → Proof Capsule
```

## Component Ownership and Authority

| Concern | Current Owner | Path | Authority | Failure Mode | Status |
|---------|---------------|------|-----------|--------------|--------|
| **Receipt Input** | Groq + User | `apps/web/app/app/tab` + `/api/vision/extract` | Model boundary; engine re-validates | Invalid JSON, hallucination | ✓ |
| **Receipt Reconciliation** | Engine (deterministic) | `packages/engine/src/reconcile.ts` | Largest-remainder split, property-tested | Mismatch to receipt total | ✓ 44 tests |
| **Debt Netting** | Engine (deterministic) | `packages/engine/src/netting.ts` | Deterministic greedy reduction | Suboptimal reduction (acceptable) | ✓ Tested |
| **Canonical Ledger** | Engine (deterministic) | `packages/engine/src/ledger.ts` | Canonical JSON + keccak256 hash | Hash instability | ✓ Tested |
| **Settlement Plan** | Engine (deterministic) | Flow orchestrator | Frozen ledger + plan hash bind consent | Modified after freeze | ⚠️ Logging added |
| **EIP-712 Signing** | viem (client) | `apps/web/lib/flow.ts:signAllTransfers` | Demo keys only; real wallet TBD | Hung promise, hung UI | ⚠️ Timeout + logging added |
| **Wallet (Real)** | MetaMask (stub) | `apps/web/lib/wallet.ts` | `eth_requestAccounts`, `eth_signTypedData_v4` | Connection fails | Stub only |
| **Contract Execution** | `FinalTabBatchSettlement.sol` | `contracts/contracts/` | Atomic batch, settlement ID, ledger hash binding | Replay, wrong recipient, expired auth | ✓ 11 tests |
| **KeeperHub Simulation** | KeeperHub API | `packages/keeperhub/src/client.ts` | Official direct-execution API | Failed simulation not caught | ✓ Tested |
| **KeeperHub Broadcast** | KeeperHub API | `packages/keeperhub/src/client.ts` | Official direct-execution API with idempotency key | Duplicate broadcast, silent success | ⚠️ Idempotency coverage |
| **KeeperHub Polling** | Flight Recorder + Verifier | `packages/keeperhub-flight-recorder` | KeeperHub status endpoint, `verified: true` gating | Unverified execution treated as proven | ✓ Tests + real tx proven |
| **Proof Storage** | App memory → proposed Supabase | `apps/web/lib/server/settlement.ts` | Append-only execution attempts | Device-local loss on refresh | ⚠️ Not persisted |
| **Persistence/Idempotency** | Supabase (TBD) | `supabase/migrations/` | Postgres RLS + uniqueness constraints | Concurrent duplicate, lost writes | ⚠️ Schema ready, not applied |

## Module Dependencies

**packages/engine** (44 tests)
- exports: `money`, `reconcile`, `netting`, `ledger`, `validation`, `split`, `eip3009`
- zero external deps except `viem`, `zod`
- no side effects, pure functions

**packages/vision** (14 tests + 1 live)
- exports: Groq receipt extraction + allocation NL
- depends: engine, zod, groq-sdk
- client-only; server-only key

**packages/keeperhub** (32 tests)
- exports: KeeperHub API client, simulation, execution, polling, receipt verification
- depends: viem, axios, zod
- server-only; credential in env

**packages/keeperhub-flight-recorder** (7 tests + real CLI usage)
- exports: `kh-proof` CLI binary
- depends: keeperhub client, axios
- reproducible polling, honest exit codes

**contracts**
- `FinalTabBatchSettlement.sol` (11 tests)
  - recipient of ReceiveWithAuthorization
  - pulls USDC via signed authorization, distributes atomically
  - validates settlementId = keccak256(ledgerHash)
  - zero balance delta check
- `MockUSDC3009.sol` (test fixture)
  - implements IERC3009Receive interface
  - nonce-bound recipient pattern

**apps/web** (Next.js App Router, TypeScript)
- routes:
  - `/` landing page (Framer Motion, animated)
  - `/auth` wallet connection (stub)
  - `/app/tab` settlement orchestrator (main journey)
  - `/app/proof` verified settlement capsule + technical detail
  - `/lab` reliability testing (intentional failures)
  - `/developers` MCP + CLI docs
  - `/open-source` license + contribution
- key client components:
  - `ReceiptCapture` → `AllocationView` → `SettlementRoom` → `ProofCapsule`
- server routes:
  - `/api/vision/extract` (Groq receipt)
  - `/api/vision/allocate` (Groq NL + engine netting)
  - `/api/keeperhub/simulate` (KeeperHub simulation)
  - `/api/keeperhub/execute` (KeeperHub broadcast)
  - `/api/keeperhub/status` (KeeperHub polling)

## Environment and Chain

- **Chain**: Base Sepolia (chainId 84532)
- **USDC**: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
- **Settlement Contract**: 0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64 (deployed? TBD, see blockers)
- **Verified USDC Domain Separator**: 0x71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818
- **Verified RECEIVE_WITH_AUTHORIZATION_TYPEHASH**: 0xe77f0b7efc35c95a7c91d5ff68f46deac34a54c1aaa90c94275b858c7c0eba4f

## Evidence Trail

| Proof | Source | Status |
|-------|--------|--------|
| Receipt extraction | Groq /api/vision/extract real request | ✓ Live |
| Allocation reconciliation | Engine tests (44 pass) + real allocation proof | ✓ Live + Tested |
| Ledger hash stability | keccak256, canonical JSON in engine tests | ✓ Tested |
| EIP-712 domain match | Hardhat test vs on-chain; domain separator verified | ✓ Tested |
| Settlement contract safe pattern | ReceiveWithAuthorization signature binding, atomicity, nonce derivation | ✓ 11 contract tests |
| KeeperHub integration | Real tx 0x1130...278c, executionId `g0w11wukbk1v0psyditx4`, verified: true | ✓ Proven live |
| CLI contribution | PR KeeperHub/cli#95 (open, not merged) | ⚠️ Pending review |
| All tests passing | pnpm test + hardhat test | ✓ 108 + 11 tests |

## Known Blockers (from prior session)

1. **Supabase Persistence**: Schema in `supabase/migrations/` but not applied. No project credentials → no server-side audit trail, idempotency, or durability. Workaround: device-local state + KeeperHub transaction as source of truth.
2. **Contract Deployment Gas**: Predicted address compiles; broadcasting via KeeperHub requires organization wallet with 231+ gwei Base Sepolia ETH. Status: Awaiting wallet funding or deployment.
3. **Sign Button Logging**: Added comprehensive logs + 10s timeout detection (commit 4543444) to diagnose silent failure. Waiting for user test execution to reveal root cause.
4. **Wallet Integration**: Real MetaMask connection is stubbed. Demo keys work; real `eth_signTypedData_v4` not tested end-to-end yet.

## Deployment Readiness

**Production (finaltab.vercel.app)**
- Live as of last commit
- Receipt extraction: Real Groq ✓
- Allocation: Real Groq + engine ✓
- KeeperHub execution proven end-to-end ✓
- Proof capsule renders ✓
- Persistence: Device-local only (no Supabase yet)

**Next Immediate Actions**
1. **User test**: Run Sign button flow with browser console open, report logs.
2. **Resolve Sign hang**: Fix root cause (promise, error swallow, or state).
3. **Gate 4 live proof**: One fresh end-to-end settlement through KeeperHub with new logging.
4. **Supabase setup** (optional for demo, required for production persistence).
5. **Contract deployment** (if required by KeeperHub submission path; currently stubbed on-chain as 0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64).
