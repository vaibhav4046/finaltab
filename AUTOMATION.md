# FINALTab Autonomous Automation

End-to-end CLI automation: deploy → settle → collect proof → submit.

## Quick Start

```bash
# 1. Set environment
$env:DEPLOYER_PRIVATE_KEY = "<your-deployer-private-key>"

# 2. Run automation
cd D:\project\finaltab
node scripts/finaltab-cli.js
```

## What It Does

1. **Verifies environment** — checks all required API keys loaded
2. **Deploys contract** — FinalTabBatchSettlement to Base Sepolia
3. **Builds web app** — pnpm build (confirms settlement address set)
4. **Runs tests** — verifies 11/11 contract tests passing
5. **Collects proof** — generates proof.json template
6. **Creates submission** — generates SUBMISSION.md
7. **Prints next steps** — ready for live settlement

## Manual Settlement Flow

After CLI completes:

```bash
# Start dev server
cd D:\project\finaltab\apps\web
pnpm dev
```

Open http://localhost:3000/app/tab and follow:
1. Upload receipt image
2. Allocate amounts
3. Freeze ledger
4. Sign transfers (EIP-712 ReceiveWithAuthorization)
5. Simulate settlement
6. Execute on Base Sepolia
7. Verify zero retained USDC

## Proof Collection

After settlement executes on-chain:

```bash
# Extract transaction hash from browser console
# Copy to proof.json

# Verify events on Etherscan/Alchemy
# - SettlementExecuted event
# - PullExecuted events (one per debtor)
# - PayoutExecuted events (one per creditor)

# Demo video — RE-RECORDED LIVE: proof-output/finaltab-demo.mp4 (1:42, 1080p, h264/aac)
# - Live Groq extraction + allocation on screen
# - LIVE KeeperHub execution on camera: VERIFIED SETTLED banner + raw status JSON
#   (tx 0xac6d32e5...7c8710, block 45312815, 2026-08-10)
```

## Submission

```bash
# Files ready for hackathon:
# - proof.json (on-chain evidence)
# - proof-output/finaltab-demo.mp4 (full user flow INCLUDING a live on-camera settle — tx 0xac6d32e5...7c8710)
# - SUBMISSION.md (technical summary)
```

## Troubleshooting

**Insufficient funds:**
```
Send 0.1+ ETH to: 0x976EF25623A94F6F70924816697C7c7172210a5F
Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
```

**Alchemy network not enabled:**
```
Dashboard: https://dashboard.alchemy.com/apps/0ywa7ovevv84upnw/networks
Enable: Base Sepolia
```

**Settlement fails to execute:**
```
Check: doSimulate logs in browser console
Verify: nonce derivation correct
Check: USDC approval sufficient
```

## Architecture

```
finaltab-cli.js (orchestrator)
  ├─ Phase 1: Env verify
  ├─ Phase 2: Deploy (hardhat run scripts/deploy.js)
  ├─ Phase 3: Build (pnpm build)
  ├─ Phase 4: Test (hardhat test)
  ├─ Phase 5: Proof (generate proof.json)
  └─ Phase 6: Submit (generate SUBMISSION.md)

ExecutionRail (browser-based settlement)
  ├─ doFreeze → canonicalizes ledger → produces ledgerHash
  ├─ doSign → signs ReceiveWithAuthorization with nonce=keccak256(ledgerHash, debtor, amount)
  ├─ doSimulate → POST /api/settle/simulate → KeeperHub dry-run
  ├─ doExecute → POST /api/settle/execute → KeeperHub broadcast
  └─ doPolling → poll /api/settle/status/[executionId] → wait for tx hash

Contract Execution (on-chain)
  ├─ executeSettlement checks all pulls valid
  ├─ pulls all USDC from debtors via receiveWithAuthorization
  ├─ pays out all creditors
  └─ verifies zero net USDC retained (balance before == after)
```

## Status

- ✅ Contract: 11/11 tests passing
- ✅ Engine: 52/52 tests passing
- ✅ Web: Build clean, TypeScript green
- ✅ Deployment: DONE — contract live at 0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64 (2259 bytes via eth_getCode). Source not yet verified on Basescan.
- ⏳ Settlement: Manual execution via UI
- ⏳ Proof: Ready to collect after settlement
- ⏳ Submission: Ready to upload to hackathon
