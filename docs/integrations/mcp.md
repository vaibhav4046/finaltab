# FINALTab MCP integration (V2)

Endpoint: `POST /api/mcp` using MCP Streamable HTTP. Every request is
authenticated; production callers should send a scoped bearer token:

```http
Authorization: Bearer <token>
Accept: application/json, text/event-stream
Content-Type: application/json
```

Store only the token's SHA-256 digest in `FINALTAB_API_TOKENS_JSON`. MCP
bootstrap and tool-list requests require `settlements:read`; tool calls also
require their specific scope. Batched JSON-RPC requests must satisfy every
scope in the batch.

The current source registers exactly nine production tools. The retired
fixed-wallet tools and their server-held signer path are absent from the
production source.

Generate a client token without printing it:

```sh
pnpm mcp:bootstrap-token
```

The raw `ft_` token is written exclusively to the gitignored
`proof-output/finaltab-mcp-token.local.json`; stdout contains only the digest
and ready-to-use `FINALTAB_API_TOKENS_JSON` metadata. The script refuses to
overwrite an existing token file. The default token omits
`settlements:submit`; explicitly run
`pnpm mcp:bootstrap-token -- --allow-settlement-submit` only when that MCP
client must be able to invoke the value-moving tool.

| Tool group | Required scope |
|---|---|
| `split_equal`, `split_weighted`, `net_debts` | `tabs:read` |
| `allocate_receipt`, `prepare_receipt_settlement`, `simulate_signed_settlement`, `create_broadcast_approval_challenge` | `settlements:prepare` |
| `submit_signed_settlement` | `settlements:submit` |
| `settlement_status` | `settlements:read` |

## Production receipt-to-proof sequence

1. Call `allocate_receipt` with arbitrary participants, receipt lines, and
   per-line weights. Items, tax, service, and tip are explicit lines; integer
   largest-remainder allocation guarantees the shares equal the receipt.
2. Call `prepare_receipt_settlement` with wallet addresses and the payer. It
   freezes a canonical ledger, computes the V2 full-plan hash, and returns two
   typed-data payloads per debtor: USDC `ReceiveWithAuthorization` and FINALTab
   `SettlementConsent`.
3. Each debtor signs both payloads in their own wallet. FINALTab does not hold
   arbitrary users' keys.
4. Assemble the signatures and call `simulate_signed_settlement`. It validates
   the complete debit+payout plan and simulates the exact call through
   KeeperHub without broadcasting.
5. Call `create_broadcast_approval_challenge`. Show the returned message to a
   human debtor and obtain an EIP-191 `personal_sign` signature. The artifact
   has a unique identifier, expires within 15 minutes, and is bound to the API
   principal, chain, V2 contract, ledger, and settlement plan. It may be retried
   until expiry; it is not described as a single-use credential.
6. Call `submit_signed_settlement` with the signed settlement and signed
   approval artifact. Every value-moving surface uses the same service-authored
   durable submission journal. For new work, the server revalidates V2,
   verifies the human artifact, simulates, records the successful simulation and
   exact bindings, then submits one deterministic-idempotency KeeperHub call.
   A retry whose acceptance is already durable skips both simulation and
   execution and returns the recorded execution. A crash-recovery retry still in
   `prepared` state reuses the stored successful simulation and identical
   idempotency key while the persisted approval lease remains bounded; a fresh
   approval may renew only an unresolved prepared intent.
7. Poll `settlement_status` with the returned `executionId`, `settlementId`, and
   `ledgerHash`. `VERIFIED_SETTLED` is returned only when KeeperHub
   proves successful receipts and an independent Base Sepolia RPC fetch finds
   the successful transaction and a V2 `SettlementExecuted` event whose indexed
   `settlementId` and `ledgerHash` match the frozen plan.

`confirm: true` is not an approval boundary and is not accepted by the
production value-moving tool.

## Codex and ChatGPT desktop

Set the raw local token as `FINALTAB_MCP_TOKEN` in the environment that starts
the client, then add this to `~/.codex/config.toml`:

```toml
[mcp_servers.finaltab]
url = "https://finaltab.vercel.app/api/mcp"
bearer_token_env_var = "FINALTAB_MCP_TOKEN"
enabled_tools = ["split_equal", "split_weighted", "net_debts", "allocate_receipt", "prepare_receipt_settlement", "simulate_signed_settlement", "create_broadcast_approval_challenge", "submit_signed_settlement", "settlement_status"]
default_tools_approval_mode = "writes"

[mcp_servers.finaltab.tools.submit_signed_settlement]
approval_mode = "prompt"
```

ChatGPT desktop, Codex CLI, and the Codex IDE extension share this config.
ChatGPT web does not read it; connect the HTTPS endpoint through a permitted
workspace plugin instead.

## V2 fail-closed gates

MCP money tools require both a valid `NEXT_PUBLIC_SETTLEMENT_CONTRACT` and
`FINALTAB_SETTLEMENT_CONTRACT_VERSION=2`. An unversioned or V1 address fails
closed.

Only Base Sepolia is implemented. Every participant name and wallet comes from
the caller's request; a receipt without names cannot manufacture them. Every
debtor supplies both external-wallet typed-data signatures, and submission also
requires a permitted wallet's short-lived approval. No Solana or mainnet adapter
is claimed.

The first-party settlement room adds an attested four-stage review before its
Freeze control. That UI review is not an undocumented tenth MCP tool: external
MCP clients use the explicit signed-payload sequence above and cannot bypass its
signature, simulation, approval, or proof boundaries.

The shared journal covers the first-party UI, `POST /api/settle/execute`, and MCP
`submit_signed_settlement`. Fresh first-party submission additionally requires
current database-backed participant approvals, and all fresh submissions
recheck the wallet-signed approval at the final pre-broadcast boundary.
Migrations `20260811073000` and `20260811074000` are applied and their tables are
inside the verified 31/31-public-table RLS posture. Journal and first-party flow
behavior remain source/test-only claims until tenant isolation and crash recovery
are probed on the candidate deployment.
