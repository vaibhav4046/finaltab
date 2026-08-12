# Settlement agent control plane

Status: implemented in source and applied at the database layer through ordered
migrations `52236`, `60000`, `73000`, and `74000`. All affected public tables
have RLS, sensitive mutation RPCs are service-role-only, and `60000` clears the
agent-event composite-FK index warning. Canonical deployment
`dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs` at commit
`039582fc44901d1f436b61a426f1523a936427f9` is `READY`, and
post-promotion cutover `74500` is applied. The complete four-stage control-plane
sequence remains source/test/schema-proven until separately exercised live.

## Product boundary

The control plane reviews an authenticated shared tab with exactly four bounded
stages:

1. receipt schema, currency, arithmetic and durable human confirmation;
2. natural-language allocation followed by deterministic bigint reconciliation;
3. Base Sepolia/USD wallet, consent and debit/payout invariants;
4. proof state.

The launcher is intentionally pre-signature. Stage four therefore records
`SETTLEMENT_NOT_SUBMITTED` as `skipped`; it cannot reuse an older verified
settlement from the same tab. Independent verification belongs to the Proofs
flow after an exact contract, settlement ID and ledger hash binding exists.

Only Base Sepolia is enabled. There is no Solana or mainnet adapter claim.

## Persistence and provenance

Migration `20260811052236_settlement_agent_control_plane.sql` creates owner- and
tab-scoped run, event and audit-memory tables with RLS; migration
`20260811060000_cover_agent_event_composite_fk.sql` covers the remaining
composite foreign-key path. Authenticated clients can
select their rows, and can delete their own audit memory, but cannot directly
insert or update evidence tables. Sensitive narrow security-definer mutation
RPCs deny `PUBLIC`, `anon`, and `authenticated`, allow `service_role`, and
enforce the supplied verified user identity, tab edit access, fixed stage order,
bounded JSON, and durable domain references. This privilege matrix and the
31/31-public-table RLS state are hosted schema facts; they are not a live
application-flow probe.

RPC reachability alone is not treated as server provenance. The Next.js server
signs each run, event and memory envelope with
`FINALTAB_AGENT_ATTESTATION_SECRET`. Signatures bind owner, tab, run/input hash,
stage/status, output hash, model metadata and usage, timestamps, and memory
revision/expiry. Every read verifies the HMAC before returning a record. Forged
RPC rows are hidden, and generic audit events contain only neutral receipt
metadata rather than unverified `passed` or `verified` claims.

Generate a random server-only value of at least 32 bytes for
`FINALTAB_AGENT_ATTESTATION_SECRET`. Never prefix it with `NEXT_PUBLIC_`, expose
it to SQL clients, or commit it.

## Cost and loop bounds

- A run UUID and pending row exist before any model call.
- The content hash deduplicates identical tab inputs.
- Existing structured allocations bypass a second model call.
- Groq is limited to the allocation stage, with an 8-second request timeout and
  28-second wall timeout and a provider-side 4,096 completion-token cap.
- Provider-reported model and token usage are retained; unknown cost remains
  `null` rather than being estimated.
- Request bodies are capped at 96 KiB, receipt items at 100, participants at 32,
  and stages at four.
- Audit memory stores one compact invariant summary per tab, expires within 180
  days, and is user-deletable. It is not replayed into model prompts, does not
  change policy, and cannot modify code.

## User and API surfaces

- `/app/agents` lists verified-provenance runs and bounded audit memory.
- `/app/agents/[id]` is the addressable evidence page.
- `POST /api/agents/runs` requires the Supabase session and a same-origin request.
- `GET /api/agents/runs`, `GET /api/agents/runs/[id]` and
  `GET /api/agents/memory` are authenticated.
- `DELETE /api/agents/memory/[id]` is authenticated and same-origin.

The settlement room launches the review only after a confirmed receipt and a
reconciled allocation exist for a real shared tab. Its Freeze action accepts
only the current attested run and the durable receipt UUID. Editing the receipt,
participants, payer, allocation, or weights clears the review result and requires
a fresh four-stage run.

This mandatory gate applies to FINALTab's first-party workspace. Authenticated
external MCP callers use the separately documented signed-payload contract; it
still requires external debtor signatures, exact simulation, short-lived human
broadcast approval, and independent proof.

The public product film demonstrates only the pre-value MCP boundary: it stops
before any wallet signature, `submit_signed_settlement` invocation, broadcast,
or value movement. Its read-only retained-settlement lane is separate from the
filmed MCP run and does not prove that this control plane executed live.

The first-party UI, REST execute endpoint, and MCP submission tool share the
`74000` service-authored submission journal. A durably accepted retry skips
simulation and execution. A prepared crash-recovery retry reuses the stored
successful simulation and deterministic idempotency key under the persisted
approval expiry. Fresh first-party submission additionally requires the current
database approvals and rechecks wallet approval immediately before broadcast.
