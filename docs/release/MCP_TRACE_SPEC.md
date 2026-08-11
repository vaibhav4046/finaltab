# MCP V2 settlement trace and capture specification

**Version:** 2.0
**Purpose:** bind an authenticated external-wallet MCP run to its KeeperHub and
Base Sepolia proof without exposing credentials.

The concise V1 record at `evidence/live-proof-4-mcp.json` is historical. It is
not a raw trace and its former seven-tool `confirm: true` flow must not be used
as the V2 capture template.

## Output

Create one UTF-8 JSONL file per run:

```text
proof-output/v2/<run-id>/mcp-trace.jsonl
```

Every line validates against [mcp-trace.schema.json](mcp-trace.schema.json)
and contains `schemaVersion`, shared UUID `runId`, contiguous `seq`, UTC `at`,
`type`, and type-specific `data`. Preserve failures and recovery calls in order.

## Required V2 sequence

1. `trace.start` — client/version, endpoint, network, redaction policy.
2. `mcp.request` / `mcp.response` — authenticated `initialize`.
3. `mcp.request` / `mcp.response` — authenticated `tools/list`.
4. `mcp.request` / `mcp.response` — `allocate_receipt`.
5. `mcp.request` / `mcp.response` — `prepare_receipt_settlement`.
6. One `wallet.signature` per debtor for both returned typed-data payloads:
   USDC `ReceiveWithAuthorization` and FINALTab `SettlementConsent`.
7. `mcp.request` / `mcp.response` — `simulate_signed_settlement`.
8. `mcp.request` / `mcp.response` —
   `create_broadcast_approval_challenge`.
9. `human.confirmation` — exact challenge text shown, decision, approver public
   address, expiry, and EIP-191 signature result.
10. `mcp.request` / `mcp.response` — `submit_signed_settlement`.
11. One or more `mcp.request` / `mcp.response` pairs for `settlement_status`.
12. `keeperhub.receipt`.
13. `chain.proof`.
14. `trace.end`.

Pure calculation tools may precede allocation. Failed calls remain in the
trace. The canonical production trace must not call fixed-wallet `demo_*`
tools. If a separate demo-fixture trace is recorded, label it
`demoOnly: true`; demo money tools are disabled by default and do not satisfy
the production V2 gate.

## Event data

### `trace.start`

```json
{
  "client": { "name": "example-mcp-client", "version": "1.0.0" },
  "endpoint": "https://finaltab.vercel.app/api/mcp",
  "network": { "name": "Base Sepolia", "chainId": 84532 },
  "contract": "0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB",
  "purpose": "V2 external-wallet settlement proof",
  "redactionPolicy": "finaltab-mcp-trace-v2"
}
```

Record the authenticated principal's public subject or pseudonymous audit ID,
not the raw bearer token or its digest.

### `mcp.request` and `mcp.response`

Store the exact redacted JSON-RPC body in `data.payload`, request/response
direction, JSON-RPC ID, HTTP status and elapsed milliseconds when available,
and protocol/tool error state. Never record authorization or cookie headers.

### `wallet.signature`

Record only public verification material:

```json
{
  "wallet": "0xPUBLIC_ADDRESS",
  "kind": "ReceiveWithAuthorization | SettlementConsent",
  "typedDataDigest": "0xPUBLIC_DIGEST",
  "signature": "0xPUBLIC_TESTNET_SIGNATURE",
  "verifiedSigner": "0xPUBLIC_ADDRESS"
}
```

Never record a private key, mnemonic, provider session secret, or wallet debug
export. Both signature kinds must be present for every debtor.

### `human.confirmation`

This is a wallet event, not a tool response:

```json
{
  "action": "submit_signed_settlement",
  "displayedText": "<exact server-issued challenge>",
  "confirmed": true,
  "method": "personal_sign / EIP-191",
  "approver": "0xPUBLIC_ADDRESS",
  "approvalId": "<public id>",
  "expiresAt": "<UTC timestamp>",
  "scope": {
    "chainId": 84532,
    "contract": "0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB",
    "settlementId": "0x…",
    "ledgerHash": "0x…"
  }
}
```

The event must follow challenge creation and precede submission. A literal
`confirm: true` is not accepted as a production approval artifact.

### `keeperhub.receipt`

Retain execution ID, terminal status, transaction hash/link, chain and block,
`verified: true`, `receiptStatus: "success"`, sponsorship and timestamps when
returned. The V2 deployment execution `xasakw5nfxkh2s0fh4stn` is deployment
proof only; the settlement trace requires a different value-moving execution.

### `chain.proof`

Independently fetch and record:

- V2 contract and Circle Base Sepolia USDC addresses;
- successful transaction receipt and block;
- expected V2 `SettlementExecuted` event and decoded plan/ledger identifiers;
- participant before/after balances and exact deltas;
- contract balance delta and conservation assertion; and
- agreement with the KeeperHub execution and transaction.

### `trace.end`

Record the terminal verdict, event count, trace byte length, and a SHA-256 in a
sidecar manifest if self-hashing the final JSONL would be ambiguous.

## Redaction rules

Forbidden everywhere in traces, screenshots, captions, narration, and video:

- bearer tokens, API keys, token digests, authorization headers, and cookies;
- private keys, mnemonics, wallet exports, and local `.env` content;
- provider dashboards or session identifiers unrelated to public proof; and
- personal data not needed to verify the transaction.

Public addresses, contract addresses, transaction/execution IDs, ledger/plan
hashes, and testnet signatures may be retained. Replace removed data with the
literal `"[REDACTED]"`; do not preserve secret prefixes or suffixes.

## Media manifest and acceptance

After rendering, create `proof-output/v2/<run-id>/manifest.json` with the public
video URL, measured media properties, byte length and SHA-256, trace filename
and SHA-256, V2 settlement execution/transaction, and review results for
captions, synchronization, proof consistency, and secrets.

The package passes only when authentication succeeds without leaking its
credential, all signatures verify, challenge precedes submission, KeeperHub and
independent RPC proof agree, balance conservation holds, all artifacts describe
one run, public links work logged out, and automated plus manual secret review
are clean. Otherwise label the run `UNPROVEN` and record a new run.
