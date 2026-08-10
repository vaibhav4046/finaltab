# FINALTab Deployment & Live Settlement Execution

## Phase 1: Alchemy Setup (Manual)

1. Visit: https://dashboard.alchemy.com/apps/0ywa7ovevv84upnw/networks
2. Enable **Base Sepolia** network
3. Fund deployer: `0x976EF25623A94F6F70924816697C7c7172210a5F`
   - Send 0.1-0.5 ETH via:
     - https://sepoliafaucet.com OR
     - https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

## Phase 2: Deploy Contract

```bash
cd D:\project\finaltab\contracts
$env:DEPLOYER_PRIVATE_KEY = "<your-deployer-private-key>"
npx hardhat run scripts/deploy.js --network base-sepolia
```

**Output:** Contract address saved to `apps/web/.env.local` as `NEXT_PUBLIC_SETTLEMENT_CONTRACT`

Example output:
```
✓ FinalTabBatchSettlement deployed to 0x...
✓ Updated apps/web/.env.local
✓ Saved deployment info to deployment.json
```

## Phase 3: Web App Ready

Build already passing. No changes needed.

```bash
cd D:\project\finaltab\apps\web
pnpm build  # Confirms settlement contract address is set
```

## Phase 4: Live Settlement Flow

1. **Create receipt** (app UI)
   - Upload image → Groq extracts items/amounts
   
2. **Create allocation** (app UI)
   - Participants select split method
   - App computes deterministic netting

3. **Freeze ledger** (ExecutionRail → doFreeze)
   - Canonicalizes → hashes → locks
   - Invalidates if any edit after this

4. **Sign transfers** (ExecutionRail → doSign)
   - Demo keys sign with settlement contract as recipient
   - Nonce = keccak256(ledgerHash, debtor, amount)
   - Real wallets: call signEIP712 with ReceiveWithAuthorization

5. **Simulate** (ExecutionRail → doSimulate)
   - POST /api/settle/simulate
   - KeeperHub dry-runs executeSettlement
   - Returns: ok=true or wouldRevert=true

6. **Execute** (ExecutionRail → doExecute)
   - POST /api/settle/execute
   - KeeperHub broadcasts to Base Sepolia
   - Returns executionId for polling

7. **Verify** (ExecutionRail → doPolling)
   - Poll /api/settle/status/[executionId]
   - Wait for tx hash + receipt
   - Confirm: all pulls succeeded, all payouts completed

## Phase 5: Proof Collection

Script to capture evidence:

```bash
node scripts/collect-proof.js
```

Captures:
- Transaction hash
- Block number
- Contract events (SettlementExecuted, PullExecuted, PayoutExecuted)
- Final balances (proof of zero retained USDC)
- Canonical ledger JSON + signatures

Output: `proof.json` (ready for submission)

## Phase 6: Demo Video

Use existing Playwright + ElevenLabs pipeline:

```bash
cd D:\project\finaltab\apps\web
pnpm playwright:record
# Follow UI: receipt → allocation → freeze → sign → simulate → execute → verify
# VO: "From receipt to settlement on-chain in under 2 minutes"
```

Output: `proof-output/finaltab-demo.mp4` (submitted with proof)

## Files Modified This Session

- ✅ `contracts/contracts/FinalTabBatchSettlement.sol` — Safe EIP-3009 ReceiveWithAuthorization pattern
- ✅ `contracts/contracts/MockUSDC3009.sol` — Extended with receiveWithAuthorization
- ✅ `contracts/test/FinalTabBatchSettlement.test.js` — All 11 tests passing
- ✅ `contracts/hardhat.config.js` — Base Sepolia + Alchemy RPC
- ✅ `contracts/scripts/deploy.js` — Saves deployment + settlement address
- ✅ `packages/engine/src/eip3009.ts` — Added buildReceiveAuthorizationTypedData
- ✅ `apps/web/lib/flow.ts` — Updated signAllTransfers to ReceiveWithAuthorization
- ✅ `apps/web/lib/wallet.ts` — signEIP712 accepts primaryType parameter
- ✅ `apps/web/.env.local` — Updated API keys + settlement contract placeholder

## Tests Status

Measured 2026-08-10 (see [docs/release/gates.md](docs/release/gates.md)):

- Engine: 52 passing ✅
- KeeperHub: 32 passing ✅
- Vision: 32 passing, 1 skipped (needs live `GROQ_API_KEY`) ✅
- Flight recorder: 7 passing ✅
- Web: 66 passing ✅
- Contract: 11 passing ✅
- **Total: 200 passing, 1 skipped**
- Web build: Clean (16 routes) ✅
- TypeScript: No errors ✅

## Submission Checklist

- [ ] Alchemy: Base Sepolia enabled
- [ ] Deployer: 0x976EF25623A94F6F70924816697C7c7172210a5F funded with 0.1+ ETH
- [ ] Contract deployed → settlement address in .env.local
- [ ] Web app builds successfully
- [x] Live settlement executed on Base Sepolia — tx `0x7bf655f3…45c12d`, block 45310631, 8.00 USDC moved atomically (2026-08-10)
- [x] Proof collected — chain-verified run report in `docs/release/evidence/`
- [x] Demo video recorded — `proof-output/finaltab-demo.mp4` (1:33). Shows the blocked settle state, not a live chain execution.
- [ ] README updated with deployment steps
- [ ] GitHub repo visibility set (if needed)
- [ ] Vercel deploy ready (or deployment link captured)

## Emergency Rollback

If contract deploy fails after Alchemy funding:
```bash
# Reset to fallback RPC
# Edit hardhat.config.js: url: "https://sepolia.base.org"
# Retry deploy (public RPC less reliable but backup option)
```

## Support

- Contract tests: `cd contracts && npx hardhat test`
- Web app tests: `cd apps/web && pnpm test`
- Live settlement state: check `/app/tab` UI (ExecutionRail shows current stage)
