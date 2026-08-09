# Scaling FINALTab: from hackathon demo to product

Honest feasibility research. Every claim below is tagged:

- **PROVEN** — exercised in this repo, with output you can reproduce.
- **VERIFIED** — the external surface exists and answers (checked 2026-08-09), but FINALTab has not integrated it yet.
- **UNVERIFIED** — plausible from public documentation, not checked live. Treat as research, not fact.

FINALTab's core thesis does not change at scale: *models propose, the deterministic
engine decides, and the chain verdict is fail-closed*. Every ingestion channel below
is just a new way to get a receipt or a debt graph into the same engine.

---

## 1. MCP distribution — ship the engine to every agent (PROVEN)

FINALTab is live as an MCP server at `https://finaltab.vercel.app/api/mcp`
(Streamable HTTP). Any MCP-capable client — Claude Desktop, Claude Code, or any
agent framework — can call:

| Tool | What it does |
|---|---|
| `split_equal` | Equal split, largest-remainder, shares always sum to total |
| `split_weighted` | Weighted split, same invariant |
| `net_debts` | Collapse a debt graph to ≤ n−1 transfers, conservation-checked |
| `settlement_status` | Fail-closed KeeperHub verdict for an execution id |

Verified with real JSON-RPC calls (initialize → tools/list → tools/call):
`split_equal {"total":"54.00","people":["vee","hem","ravi"]}` returned three
`"18.00"` shares with `sumsToTotal: true`, and `settlement_status` on execution
`g0w11wukbk1v0psyditx4` returned `VERIFIED_SETTLED` with the real Base Sepolia
receipt (tx `0x1130…278c`, block 45243955).

Why this matters for scale: the marginal cost of a new "client" is zero. Instead
of building N frontends, one MCP endpoint makes FINALTab the money-math and
settlement-verification layer for any agent. LLMs are notoriously bad at cent
arithmetic; an agent that delegates to `split_equal` never produces a split that
doesn't sum. This is the highest-leverage, lowest-cost scaling path and it is
already shipped.

Claude Desktop config:

```json
{
  "mcpServers": {
    "finaltab": { "url": "https://finaltab.vercel.app/api/mcp" }
  }
}
```

## 2. Bank-feed receipt ingest — Open Banking (VERIFIED surface, not integrated)

The user asked: can we ingest receipts directly from the banking system? Split
answer:

**Transactions: yes.** UK/EU Open Banking gives read-only transaction feeds via
regulated aggregators. Checked live 2026-08-09: TrueLayer docs (docs.truelayer.com,
HTTP 200), GoCardless Bank Account Data (developer.gocardless.com, HTTP 200), and
Plaid Transactions for the US (plaid.com/docs, HTTP 200) all answer. A transaction
row gives merchant, amount, currency, timestamp — enough to *start* a tab
("Dishoom £54.00, Friday 21:14 — split this?").

**Line items: no.** Bank feeds do not carry itemised receipts. Card networks see
the total, not the basket. So the bank feed *triggers* the split; the photo (or
email receipt) still supplies the items. FINALTab's existing Groq vision parser
already handles that half.

Feasibility constraints, stated honestly:

- **Regulatory**: production access to UK Open Banking requires FCA authorisation
  as an AISP or, realistically, riding as an *agent* of a licensed aggregator
  (TrueLayer/GoCardless offer this). Sandbox access is free and instant;
  production is a compliance process measured in weeks. (UNVERIFIED beyond the
  docs' own claims.)
- **Cost**: GoCardless Bank Account Data has a free tier (up to a bounded number
  of connections); TrueLayer and Plaid are usage-priced with free sandboxes.
  Within this project's £0 budget only the sandboxes are reachable today.
  (UNVERIFIED — pricing pages change.)
- **Architecture fit**: a webhook per new card transaction → match against a
  merchant allowlist → open a draft tab in FINALTab → user snaps the receipt →
  engine splits → KeeperHub settles. No new engine code; one new ingest route.

Verdict: real, buildable, but it is a post-hackathon integration because the
gate is credentialing, not code.

## 3. Splitwise import — meet users where their debts already live (VERIFIED surface)

Checked live 2026-08-09: the Splitwise API exists and answers. `dev.splitwise.com`
serves full API docs (HTTP 200) and `secure.splitwise.com/api/v3.0/get_current_user`
returns a proper `401 {"error":"Invalid API Request: you are not logged in"}` —
a live, auth-gated endpoint.

The killer flow: Splitwise is where group debts *accumulate*, but Splitwise does
not move money — it delegates to Venmo/PayPal links. FINALTab's `net_debts` +
KeeperHub settlement is exactly the missing last mile:

1. OAuth2 into Splitwise (`get_groups`, `get_expenses`).
2. Convert group balances to FINALTab `Debt[]` (integer minor units).
3. `nettedTransfers` collapses months of IOUs to ≤ n−1 transfers.
4. One batch settlement onchain, with a fail-closed verdict per transfer.

Constraints: OAuth app registration required (free, UNVERIFIED how long approval
takes); rate limits are not publicly specified (UNVERIFIED). The mapping code is
a day of work because the engine already speaks `Debt[]`.

## 4. Email receipt ingest — forward-to-split (UNVERIFIED, high confidence)

Most digital receipts (Uber Eats, Deliveroo, Amazon, OpenTable) arrive as email.
A `receipts@finaltab.app` inbound address turns email into the same
`ParsedReceipt` pipeline:

- Inbound email: Cloudflare Email Workers (free tier) or Postmark inbound parsing
  (paid). Both are established products (UNVERIFIED live, well-documented).
- The HTML body or PDF attachment goes to the existing Groq vision/text parser —
  the same `/api/vision/extract` path the camera uses today.
- Arithmetic reconciliation (subtotal + tax + tip = total) already rejects
  hallucinated line items; that guard transfers unchanged.

This is the cheapest real-world ingest to build after MCP: no regulator, no
OAuth partner, one MX record and one route.

## 5. Settlement economics at scale (PROVEN on testnet, mainnet UNVERIFIED)

Today: KeeperHub sponsors USDC transfer gas on Base Sepolia — the three verified
flights in `proof-output/` cost £0 and each carries a `verified: true` receipt.

Mainnet honestly:

- Base mainnet USDC transfer gas is typically fractions of a cent; a netted
  settlement (≤ n−1 transfers instead of n·(n−1)/2 pairwise IOUs) amortises even
  further. (UNVERIFIED exact figures — gas markets move.)
- KeeperHub's gas-refuel on mainnet is a paid x402 flow; sponsorship terms for
  production apps are a business conversation, not an API call (checked: no free
  mainnet faucet/funding route exists in their REST surface).
- The `FinalTabBatchSettlement` contract (Hardhat-tested, 11 passing tests)
  batches transfers so per-tab cost approaches one transaction regardless of
  group size.

The fail-closed verifier is the part that scales *because* it is conservative:
at 10 tabs or 10 million, "a bare tx hash is never proof" is the same check.

## 6. Per-user accounts (SHIPPED honest version, upgrade path defined)

Today `/auth` is device-local identity: a profile and tab history in
`localStorage`, labelled as exactly that in the UI — no fake cloud, no invented
accounts. The upgrade path is Supabase (auth + Postgres row-level security), at
which point tab history, group membership, and Splitwise/bank links attach to a
real user id. The `Profile`/`TabRecord` shapes in `lib/identity.ts` were designed
to survive that migration unchanged.

## Priority order (opinionated)

1. **MCP** — shipped, zero marginal cost, unique among split apps.
2. **Email ingest** — days of work, no gatekeepers, huge receipt coverage.
3. **Splitwise import** — API verified live, engine already fits, distribution
   hack (their users are pre-qualified).
4. **Open Banking triggers** — highest wow, longest credentialing path.
5. **Mainnet settlement** — when 1–4 create real users, the gas conversation
   with KeeperHub becomes worth having.
