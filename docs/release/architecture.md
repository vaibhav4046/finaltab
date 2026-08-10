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
| **Receipt Reconciliation** | Engine (deterministic) | `packages/engine/src/reconcile.ts` | Largest-remainder split, property-tested | Mismatch to receipt total | ✓ 52 tests |
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

**packages/engine** (52 tests)
- exports: `money`, `reconcile`, `netting`, `ledger`, `validation`, `split`, `eip3009`
- zero external deps except `viem`, `zod`
- no side effects, pure functions

**packages/vision** (32 tests, + 1 skipped: the live-key test, env-gated)
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

**apps/web** (66 tests)
- `test/apiText.test.ts` (20) locks the error-text coercion that caused the Simulate white-screen
- `test/demoKeys.test.ts` (46) locks demo-signer persistence and the opt-in flag behaviour

The five figures above sum to 189, which is the workspace total in
[gates.md](gates.md); 52 + 32 + 32 + 7 + 66. They are meant to reconcile, so if they ever stop
reconciling, one of the two documents is stale.

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
  - `/app` in-app home hub
  - `/app/tab` settlement orchestrator (main journey)
  - `/app/proof` verified settlement capsule + technical detail
  - `/lab` reliability testing (intentional failures)
  - `/developers` MCP + CLI docs
  - `/open-source` license + contribution
- key client components:
  - `ReceiptCapture` → `AllocationView` → `SettlementRoom` → `ProofCapsule`
- server routes (this list is the output of `find apps/web/app/api -name route.ts`, not a
  hand-maintained one — an earlier revision documented three `/api/keeperhub/*` endpoints that have
  never existed under that path, which would have sent anyone reading this straight into a 404):
  - `/api/vision/extract` (receipt extraction, Groq leg live)
  - `/api/vision/allocate` (natural-language allocation + engine netting)
  - `/api/settle/simulate` (KeeperHub simulation; returns HTTP 409 when the call would revert)
  - `/api/settle/execute` (KeeperHub broadcast)
  - `/api/settle/status/[id]` (KeeperHub polling)
  - `/api/mcp` (MCP server endpoint, Streamable HTTP)

## Environment and Chain

- **Chain**: Base Sepolia (chainId 84532)
- **USDC**: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
- **Settlement Contract**: 0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64 — **deployed and live**.
  `eth_getCode` against `https://sepolia.base.org` returns 2259 bytes at that address, re-queried
  2026-08-10. An earlier revision of this line said "deployed? TBD, see blockers", which contradicted
  gate 9; the contract being live and `executeSettlement` never having been *called* are two
  different facts, and only the second one is still open.
- **Verified USDC Domain Separator**: 0x71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818
- **Verified RECEIVE_WITH_AUTHORIZATION_TYPEHASH**: 0xe77f0b7efc35c95a7c91d5ff68f46deac34a54c1aaa90c94275b858c7c0eba4f

## Evidence Trail

| Proof | Source | Status |
|-------|--------|--------|
| Receipt extraction | Groq /api/vision/extract real request | ✓ Live |
| Allocation reconciliation | Engine tests (52 pass) + real allocation proof | ✓ Live + Tested |
| Ledger hash stability | keccak256, canonical JSON in engine tests | ✓ Tested |
| EIP-712 domain match | Hardhat test vs on-chain; domain separator verified | ✓ Tested |
| Settlement contract safe pattern | ReceiveWithAuthorization signature binding, atomicity, nonce derivation | ✓ 11 contract tests |
| KeeperHub integration | Real tx 0x1130...278c, executionId `g0w11wukbk1v0psyditx4`, verified: true | ✓ Proven live |
| CLI contribution | PR KeeperHub/cli#95 (open, not merged) | ⚠️ Pending review |
| All tests passing | pnpm test + hardhat test | ✓ 189 + 11 = 200 tests, 1 skipped (measured 2026-08-10) |
| LLM fallback cascade | 12 tests driving the real router with each SDK mocked at the module boundary | ⚠️ Cascade FIXTURE_PROVEN; only the Groq leg has ever contacted a real API |

## Known Blockers (measured, not assumed)

1. **Supabase Persistence**: Schema in `supabase/migrations/` but **not applied** — no project credentials. There is no server-side audit trail, no idempotency, and nothing is durable. The app is stateless per session; device-local state plus the KeeperHub transaction are the only sources of truth.
2. **Contract Deployment Gas**: Superseded. The contract **is** deployed at `0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64` (2259 bytes of code, confirmed by `eth_getCode`). The KeeperHub deploy attempt that failed did so because the relayer holds no native ETH: `Insufficient BASE balance. Have: 0.0, Need: 0.000000231.` KeeperHub sponsors transfers, not contract-call gas. Source is **not yet verified on Basescan**, which is why the settle route passes the ABI inline.
3. **Batch settlement never executed onchain**: `executeSettlement` has never moved USDC on a public chain. Every demo account holds zero USDC, so Simulate honestly returns "WOULD REVERT — NOT BROADCAST". Full measurement in [truth-snapshot.md](truth-snapshot.md).
4. **Wallet Integration**: Real MetaMask connection is stubbed. Demo keys work; real `eth_signTypedData_v4` not tested end-to-end yet.
5. **Fallback providers unproven live**: the Claude and OpenAI legs of the extraction cascade are test-covered but have never contacted their real APIs. No keys are configured for them.

The "Sign Button Silent Failure" listed here in a prior revision was **disproven** by live browser testing — the button works. The real defect in that area was a React crash on the Simulate path (untyped `res.json()` flowing into `string` state), now fixed and locked by 20 tests in `apps/web/test/apiText.test.ts`.

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
