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

The current source registers nine production tools plus three separately
labelled `demo_*` tools. Demo tools are disabled by default and are not the
external-wallet product flow.

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
| `settlement_status`, `demo_get_balances` | `settlements:read` |
| `demo_prepare_settlement` | `settlements:prepare` |
| `demo_settle_tab` | `settlements:submit` |

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
   approval artifact. The server revalidates V2, verifies the human artifact,
   re-simulates, and submits an idempotent atomic KeeperHub call.
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

## V2 and demo gates

MCP money tools require both a valid `NEXT_PUBLIC_SETTLEMENT_CONTRACT` and
`FINALTAB_SETTLEMENT_CONTRACT_VERSION=2`. An unversioned or V1 address fails
closed.

The fixed Vee/Hem/Ravi path is retained only as `demo_*`, is Base Sepolia
testnet-only, and is disabled unless
`FINALTAB_ENABLE_DEMO_MONEY_TOOLS=true`. `demo_settle_tab` additionally requires
a fresh approval signed by `FINALTAB_DEMO_APPROVER_ADDRESS`. This path is not
the production user-wallet workflow.
