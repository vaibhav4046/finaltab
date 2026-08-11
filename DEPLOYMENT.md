# FINALTab V2 deployment and release runbook

## Proven contract deployment

`FinalTabBatchSettlementV2` is already deployed on Base Sepolia. Do not deploy
another contract merely to fill a configuration field.

| Field | Proven value |
|---|---|
| Contract | `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB` |
| KeeperHub execution | `xasakw5nfxkh2s0fh4stn` |
| Transaction | `0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f` |
| Block | `45321107` |
| Source | Sourcify exact creation/runtime match `43497805` |
| Evidence | `docs/release/evidence/v2-deployment-2026-08-11T01-08-17-421Z.json` |

## Web and MCP configuration

Set public protocol values exactly:

```dotenv
NEXT_PUBLIC_SETTLEMENT_CONTRACT=0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB
FINALTAB_SETTLEMENT_CONTRACT_VERSION=2
```

Supply `KEEPERHUB_API_KEY`, provider keys, Supabase credentials, and
`FINALTAB_API_TOKENS_JSON` only through server-side secret storage. Store only
FINALTab token SHA-256 digests. Keep
`FINALTAB_ENABLE_DEMO_MONEY_TOOLS=false` for the production external-wallet
path.

After deploying the web service, verify:

1. discovery reports the V2 address and readiness;
2. anonymous MCP requests are rejected;
3. a scoped redacted token can initialize and list tools;
4. production tools request external wallet signatures;
5. demo money tools refuse while disabled; and
6. no token or provider secret appears in logs or browser bundles.

## V2 live settlement — pending release gate

Deployment proof is not settlement proof. Before submission, execute one
authenticated external-wallet Base Sepolia USDC settlement:

```text
allocate_receipt
→ prepare_receipt_settlement
→ debtor wallets sign both typed-data payloads
→ simulate_signed_settlement
→ create_broadcast_approval_challenge
→ permitted human wallet personal_sign
→ submit_signed_settlement
→ settlement_status
```

Retain the redacted trace, KeeperHub execution/receipt, independent Base
Sepolia receipt, V2 event, and exact balance deltas under one run ID. Follow
`docs/release/MCP_TRACE_SPEC.md`.

## Verification commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts
pnpm build
pnpm test:e2e
```

Record the fresh results from the final commit. Historical V1 counts and video
metadata are not current release evidence.

## Video and submission — pending human actions

Render the final video only from the proven V2 settlement package. Measure its
actual metadata and SHA-256, upload it to a URL that opens logged out, update
the canonical release docs, and submit once before 2026-08-13 12:00 UTC+2
(10:00 UTC / 11:00 BST). The live form was checked on 2026-08-11 and requires
a source link, a short video showing the agent executing onchain through
KeeperHub, and a transaction link. No current public video URL is claimed.

## Historical V1 note

The legacy V1 contract `0xCcf6…7e64`, fixed demo signers, seven-tool MCP flow,
`confirm: true`, and 2026-08-10 settlements are preserved as historical
evidence only. Do not copy them into V2 deployment or settlement fields.
