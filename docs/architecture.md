# FINALTab architecture

How the current V2 system is put together, in six diagrams.

This document describes the code on `agent/finaltab-voice-hybrid`, whose tip is
also the `main` tip. It is not a deployment claim:
[docs/release/status.md](release/status.md) is the operational source of truth
for what is running, and production currently serves commit
`cb8b6484427d30cb31a0a2dd511e617ff42dda06`, which the live `/api/health`
reports as `commit: cb8b6484427d`. The archived V1 map lives in
[docs/release/architecture.md](release/architecture.md) and is kept as history
rather than updated.

Every diagram below is drawn from source. Where a diagram distinguishes who
produced a value, it uses the same six-way provenance split the product itself
renders, defined in
[`apps/web/lib/agentMemoryGraph.ts`](../apps/web/lib/agentMemoryGraph.ts):

| Provenance | Meaning |
|---|---|
| `model` | A language or vision model proposed it. Never authoritative over money. |
| `deterministic` | Computed by `packages/engine`. Same input, same cents, every time. |
| `human_wallet` | A person signed it with a wallet they control. |
| `keeperhub` | Returned by the KeeperHub execution layer. |
| `onchain` | Read back from Base Sepolia by an independent JSON-RPC check. |
| `memory` | A bounded evidence record retained for later runs. |

---

## 1. System and trust boundaries

Nothing a model produces crosses into the money path without a deterministic
recomputation and a human wallet signature in between. The private schema and
the provider keys sit on the far side of the server boundary and are never
reachable from a browser.

```mermaid
flowchart TB
  subgraph client["Browser · untrusted"]
    ui["Next.js App Router UI<br/>/ · /app · /join · /developers · /integrations"]
    wallet["User wallet<br/>Privy · lazy-loaded"]
  end

  subgraph agent["MCP client · scoped, untrusted"]
    mcp["Authenticated MCP V2<br/>9 tools"]
  end

  subgraph server["Vercel server runtime · trusted"]
    api["Route handlers<br/>apps/web/app/api/*"]
    access["authorizeApiRequest<br/>principal · scope · origin · rate limit"]
    engine["packages/engine<br/>deterministic allocation and netting"]
    vision["packages/vision<br/>extraction cascade"]
    kh["packages/keeperhub<br/>client and verifier"]
    proof["onchainProof.ts<br/>independent JSON-RPC check"]
  end

  subgraph data["Supabase Postgres"]
    pub["public.* · RLS, authenticated only"]
    priv["private.* · revoked from anon and authenticated"]
  end

  subgraph external["External"]
    providers["Vision and voice providers<br/>keys are server-only env vars"]
    keeperhub["KeeperHub<br/>exclusive execution layer"]
    chain["Base Sepolia · chain 84532"]
  end

  ui --> access
  mcp --> access
  access --> api
  api --> engine
  api --> vision
  api --> kh
  api --> proof
  vision --> providers
  kh --> keeperhub
  proof --> chain
  keeperhub --> chain
  api --> pub
  pub -. "policy helpers only" .-> priv
  wallet -- "EIP-712 signature" --> ui

  classDef model fill:#e8e2ff,stroke:#5b4bd6,color:#1a1440
  classDef det fill:#dff3e4,stroke:#2f7d47,color:#0d2916
  classDef human fill:#ffeccf,stroke:#b3720d,color:#3a2402
  classDef keeper fill:#d9ecff,stroke:#1c62b0,color:#0a2340
  classDef onchain fill:#ffe1e6,stroke:#b3243c,color:#3d0a13
  class vision,providers model
  class engine det
  class wallet human
  class kh,keeperhub keeper
  class proof,chain onchain
```

**Boundary rules that hold in code, not just in prose**

- Provider keys for vision and voice exist only as sensitive server environment
  variables. No provider key is ever sent to a browser.
- `private.*` is revoked from `public` and `anon`, and its RLS helper functions
  are `SECURITY DEFINER` with an empty `search_path`, granted only to
  `authenticated`.
- No participant private key is held server-side. Consent is an EIP-712
  signature produced in the user's own wallet.
- KeeperHub is the only execution path. The server never broadcasts directly.

---

## 2. Settlement lifecycle

The full path from a photographed receipt to a settlement the product is willing
to call settled. Colour marks who produced each step.

```mermaid
flowchart TB
  receipt["Receipt image"] --> extract["Extraction cascade<br/>groq → claude → openai"]
  extract --> alloc["Deterministic allocation<br/>cent-exact, remainder assigned by rule"]
  alloc --> net["Debt netting<br/>fewest transfers"]
  net --> review["Agent review<br/>extraction · arithmetic · consent risk · proof readiness"]
  review --> attest["Attestation<br/>plan hash over the exact transfers"]
  attest --> freeze["Frozen ledger and plan<br/>no further edits"]
  freeze --> consent["Wallet consent<br/>EIP-712 · EIP-3009 authorization"]
  consent --> sim["Simulation<br/>must return success and must not revert"]
  sim --> approve["Human broadcast approval<br/>challenge signed for this exact plan"]
  approve --> exec["KeeperHub execution"]
  exec --> verify["Independent chain verification<br/>eth_getTransactionReceipt on Base Sepolia"]
  verify --> settled["verified_settled"]
  verify -- "receipt missing or mismatched" --> unverified["completed_unverified<br/>reported as unverified, not as settled"]
  review -- "arithmetic or consent risk" --> blocked["Blocked before any signature"]

  classDef model fill:#e8e2ff,stroke:#5b4bd6,color:#1a1440
  classDef det fill:#dff3e4,stroke:#2f7d47,color:#0d2916
  classDef human fill:#ffeccf,stroke:#b3720d,color:#3a2402
  classDef keeper fill:#d9ecff,stroke:#1c62b0,color:#0a2340
  classDef onchain fill:#ffe1e6,stroke:#b3243c,color:#3d0a13
  classDef bad fill:#f2f2f2,stroke:#666,color:#222
  class extract,review model
  class alloc,net,attest,freeze,sim det
  class consent,approve human
  class exec keeper
  class verify,settled onchain
  class blocked,unverified bad
```

The two failure edges are the point. An agent review that flags an arithmetic or
consent problem stops the flow before any signature exists, and a settlement
whose onchain receipt cannot be confirmed lands in `completed_unverified` rather
than being reported as done.

---

## 3. Authentication and the RLS boundary

Three principal sources reach the same authorization funnel, and they are not
equivalent. A cookie session is the only one subject to the same-origin check,
and it is also the only one eligible for the narrow session-fallback scope.

```mermaid
flowchart TB
  cookie["Cookie session<br/>source: session"] --> principal
  jwt["Bearer JWT<br/>source: bearer-jwt"] --> principal
  token["Hashed API token<br/>source: bearer-token<br/>sha256, timing-safe compare"] --> principal

  principal["requestPrincipal"] --> size{"content-length<br/>within maxBytes?"}
  size -- no --> r413["413 PAYLOAD_TOO_LARGE"]
  size -- yes --> auth{"principal resolved?"}
  auth -- no --> r401["401 AUTH_REQUIRED"]
  auth -- yes --> scope{"principal holds<br/>required scope?"}
  scope -- no --> r403["403 SCOPE_REQUIRED"]
  scope -- yes --> origin{"session principal?<br/>origin is canonical?"}
  origin -- no --> r403o["403 ORIGIN_REJECTED"]
  origin -- yes --> rate{"under rate limit<br/>for rateKey:scope?"}
  rate -- no --> r429["429 RATE_LIMITED<br/>retry-after"]
  rate -- yes --> handler["Route handler"]

  handler --> rls["Supabase client<br/>acting as authenticated"]
  rls --> policies["public.* RLS policies<br/>granted to authenticated only"]
  policies --> helpers["private.is_tab_member<br/>private.is_tab_owner<br/>private.can_edit_tab"]

  anon["anon role"] -.-> denied["No table grants.<br/>Revoked from private schema."]

  classDef bad fill:#f2f2f2,stroke:#666,color:#222
  class r413,r401,r403,r403o,r429,denied bad
```

**Scopes.** Six exist: `tabs:read`, `tabs:write`, `receipts:write`,
`settlements:prepare`, `settlements:submit`, `settlements:read`. A newly created
signed-in user receives five of them by default. `settlements:submit` is
deliberately not among them: it must be granted explicitly in
`app_metadata.finaltab_scopes` or on a hashed bearer token, so missing
authorization metadata is never equivalent to a grant to broadcast value.

**Least privilege in the database.** Policies are attached `to authenticated`,
never to `public` or `anon`. Membership is resolved through `SECURITY DEFINER`
helpers in the `private` schema, which exist to avoid recursive policies and
which begin by requiring a real `auth.uid()`. Signatures and USDC
authorizations have no authenticated `SELECT` grant at all: collaboration UI
reads approval state through a narrow RPC that returns state without returning
signature material.

---

## 4. MCP request lifecycle

The MCP surface is not a second, looser door into the money path. It shares the
authorization funnel from diagram 3, and its value-moving tool is rate limited
six times harder than its read and prepare tools.

```mermaid
sequenceDiagram
  autonumber
  participant C as MCP client
  participant R as /api/mcp
  participant A as authorizeScopes
  participant P as authorizeApiRequest
  participant E as packages/engine
  participant K as KeeperHub
  participant B as Base Sepolia

  C->>R: tools/call
  R->>A: scopes required by this payload
  loop once per required scope
    A->>P: scope + per-scope rate bucket
    P-->>A: principal or 401/403/429
  end
  A-->>R: principal, or first rejection
  Note over A,P: settlements:submit 5 req/min<br/>settlements:prepare 30 req/min<br/>all other scopes 120 req/min

  alt read or compute tool
    R->>E: split_equal · split_weighted · net_debts · allocate_receipt
    E-->>R: deterministic result
    R-->>C: result
  else prepare
    R->>E: prepare_receipt_settlement
    E-->>R: frozen plan + plan hash
    R-->>C: plan for wallet signature
  else simulate
    R->>K: simulate_signed_settlement
    K-->>R: success / wouldRevert
    R-->>C: simulation record
  else submit
    R->>R: create_broadcast_approval_challenge
    C->>R: submit_signed_settlement<br/>with signed challenge
    R->>K: execute
    K-->>R: execution id + status
    R->>B: eth_getTransactionReceipt
    B-->>R: receipt or null
    R-->>C: settlement_status<br/>verified_settled or completed_unverified
  end
```

A tool is never authorized on a scope it did not ask for: `mcpScopesForPayload`
derives the required scope set from the payload, and every one of them has to
pass before the handler runs. The nine tools, in registration order: `split_equal`,
`split_weighted`, `net_debts`, `allocate_receipt`,
`prepare_receipt_settlement`, `simulate_signed_settlement`,
`create_broadcast_approval_challenge`, `submit_signed_settlement`,
`settlement_status`.

---

## 5. Durable submission intent and idempotency

Every value-moving surface, first-party UI and REST and MCP alike, creates the
same deterministic intent row before KeeperHub is called. The row is the reason
a crashed or retried submission cannot become two onchain transfers.

```mermaid
stateDiagram-v2
  direction TB
  [*] --> prepared: revision 1
  prepared --> accepted: revision 2
  accepted --> completed_unverified: revision 3
  accepted --> failed: revision 3
  accepted --> timeout: revision 3
  accepted --> verified_settled: revision 3, confirmed on first read
  completed_unverified --> verified_settled: revision 4
  verified_settled --> [*]
  failed --> [*]
  timeout --> [*]

  note right of prepared
    revision 1: idempotency_key is a
    sha256 over the plan, chain_id must
    be 84532, every evidence column is
    still null, and approval_expires_at
    must be later than prepared_at.
  end note
  note right of accepted
    revision 2: execution_* recorded,
    keeperhub_status still null.
    A unique index on execution_id means
    one KeeperHub execution attaches to
    exactly one intent.
  end note
  note right of completed_unverified
    revision 3 requires proof_hash and
    independent_proof. The simulation
    record is constrained to success and
    to not reverting, so an intent cannot
    advance on a simulation that
    predicted a revert.
  end note
```

The state and the revision are checked together, not separately. Each revision
is a `check` constraint listing exactly which evidence columns must be present
and which must still be null, so a row cannot claim a later state while missing
the evidence that state is supposed to carry. Advancing the story requires
producing the proof.

---

## 6. Agent memory as bounded evidence lineage

The memory graph is not a self-modifying model and holds no learned weights. It
is a bounded record of what each run actually produced, arranged so a reader can
walk from the receipt to the chain and see every hand the value passed through.

```mermaid
flowchart TB
  input["Receipt input<br/>kind: input"] --> s1["Extraction<br/>stage"]
  s1 --> s2["Allocation<br/>stage"]
  s2 --> s3["Consent risk<br/>stage"]
  s3 --> s4["Proof readiness<br/>stage"]
  s4 --> ev["Evidence records<br/>kind: evidence"]

  ev --> l1["Frozen ledger"]
  l1 --> l2["Wallet consent"]
  l2 --> l3["Simulation"]
  l3 --> l4["Broadcast approval"]
  l4 --> l5["KeeperHub execution"]
  l5 --> l6["Chain verification"]
  l6 --> mem["Bounded memory<br/>kind: memory"]

  l3 -. "recorded: false" .-> gap["Rendered as missing.<br/>Node stays in the chain."]

  classDef model fill:#e8e2ff,stroke:#5b4bd6,color:#1a1440
  classDef det fill:#dff3e4,stroke:#2f7d47,color:#0d2916
  classDef human fill:#ffeccf,stroke:#b3720d,color:#3a2402
  classDef keeper fill:#d9ecff,stroke:#1c62b0,color:#0a2340
  classDef onchain fill:#ffe1e6,stroke:#b3243c,color:#3d0a13
  classDef memory fill:#eae6df,stroke:#6b5f4e,color:#241d12
  classDef bad fill:#f2f2f2,stroke:#666,color:#222
  class s1,s3 model
  class input,s2,s4,l1,l3 det
  class l2,l4 human
  class l5 keeper
  class l6 onchain
  class ev,mem memory
  class gap bad
```

Two properties make this an evidence structure rather than a story.

**Gaps stay visible.** A node whose service returned no evidence is kept in the
chain with `recorded: false` and counted in `missingCount`. It renders as
missing. No node is ever synthesised from a value the service did not return, so
an incomplete run looks incomplete instead of looking successful.

**Provenance is per node, not per graph.** The same six-way split from the table
at the top of this document is attached to each node, which is what lets a
reader see at a glance that the arithmetic was deterministic, the consent was
human, and the confirmation was read back over an independent JSON-RPC call
rather than taken from the executor's own word.

---

## Where to look in the code

| Concern | Path |
|---|---|
| Authorization funnel | [`apps/web/lib/server/apiAccess.ts`](../apps/web/lib/server/apiAccess.ts) |
| MCP surface | [`apps/web/app/api/mcp/route.ts`](../apps/web/app/api/mcp/route.ts) |
| Deterministic allocation and netting | [`packages/engine/src/index.ts`](../packages/engine/src/index.ts) |
| Extraction cascade | [`packages/vision/src/fallbackRouter.ts`](../packages/vision/src/fallbackRouter.ts) |
| KeeperHub client and verifier | [`packages/keeperhub/src/index.ts`](../packages/keeperhub/src/index.ts) |
| Independent chain check | [`apps/web/lib/server/onchainProof.ts`](../apps/web/lib/server/onchainProof.ts) |
| Durable submission intents | [`supabase/migrations/20260811074000_durable_submission_intents.sql`](../supabase/migrations/20260811074000_durable_submission_intents.sql) |
| Tenancy, RLS and approvals | [`supabase/migrations/20260811003158_production_tenancy_and_approvals.sql`](../supabase/migrations/20260811003158_production_tenancy_and_approvals.sql) |
| Memory graph model | [`apps/web/lib/agentMemoryGraph.ts`](../apps/web/lib/agentMemoryGraph.ts) |
| Release truth | [`docs/release/status.md`](release/status.md) |
