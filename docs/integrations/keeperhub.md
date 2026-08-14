# KeeperHub integration package

FINALTab exposes a small, auditable integration surface for KeeperHub without
pretending that a webhook body is settlement proof. The package is testnet-only
and targets `FinalTabBatchSettlementV2` on Base Sepolia (chain ID `84532`). It
must not be pointed at the legacy V1 contract.

## What is implemented

| Surface | URL | Purpose |
| --- | --- | --- |
| Discovery | `/.well-known/finaltab.json` | FINALTab-owned capability document with live origin and V2 readiness |
| OpenAPI | `/openapi.json` | Receipt, allocation, configuration-gated voice, V2 settlement, proof, and callback contracts |
| MCP | `/api/mcp` | Agent tool surface (described, but not reimplemented, by this package) |
| Voice session | `/api/voice/token` | Configuration-gated AssemblyAI live-STT session bootstrap; returns only a short-lived browser credential |
| Voice readback | `/api/voice/speak` | Configuration-gated ElevenLabs MP3 readback for short product confirmations |
| Workflow export | `/integrations/keeperhub/workflow` | KeeperHub import/export schema v1 JSON download |
| Observer | `/api/integrations/keeperhub/events` | Read-only callback target that re-fetches KeeperHub and independently verifies Base Sepolia |
| Version-controlled template | `integrations/keeperhub/finaltab-proof-observer.workflow.json` | Reviewable Hub/import artifact with no credential material |

The well-known document is a **FINALTab convention**, not a claimed KeeperHub
manifest standard. KeeperHub currently documents Workflow JSON import/export,
Hub sharing, Marketplace publication, REST, MCP, and Webhook/Send Webhook nodes;
it does not document a native third-party application or iframe manifest.

## Optional hybrid voice

Voice is an application convenience, not part of KeeperHub execution or proof.
When the corresponding server configuration is present, AssemblyAI supplies
live streaming speech-to-text and ElevenLabs supplies a short spoken readback.
Both paid routes require a signed-in Supabase user: either the same-origin
browser cookie session or a validated Supabase access JWT. A scoped opaque
FINALTab (`ft_...`) bearer is intentionally insufficient even when it has the
  nominal route scope, because it does not represent a verified Supabase user.
`POST /api/voice/token` exposes only a short-lived AssemblyAI redemption
credential and constrained WebSocket settings; `POST /api/voice/speak` streams
the ElevenLabs response from the route, while the current browser client buffers
the short MP3 before playback. Both permanent provider keys remain server-only.

The production provider variables are stored as sensitive Vercel values. The
production Supabase guard preserves the applied per-minute limits
(8 transcription requests and 20 readbacks); applied migration `64822` adds
atomic UTC-day/month user and project spend budgets through the service-role-only
`reserve_voice_budget_service(uuid, text, bigint)`. The route passes only the exact
  Supabase user ID it already verified; browsers cannot invoke the reservation
  RPC directly. AssemblyAI reserves its
full 180-second maximum before token mint and holds a 240-second, 1-user/
4-project concurrency lease; ElevenLabs reserves 1–600 input characters before
generation. All backing tables are RLS-protected with direct anonymous and
authenticated access revoked. Safe budget and request headers survive subsequent
provider errors. If the store is unavailable, the provider is not called. See
[voice.md](voice.md) for exact cap semantics. These are deployed configuration
facts. Production session minting is separately live-proven — a bodyless
authenticated `POST /api/voice/token` returns `200` with a real provider session
and durable quota headers, and a declared request body is still refused with
`413`. The browser microphone-capture lifecycle is also live-proven as of
2026-08-14 on a real device: acquisition, a live `429` concurrency refusal, a
`200` mint, `LISTENING`, and a clean device release. In-app ElevenLabs readback
remains unproven — no synthesis request has been issued from the deployed app.

The routes and OpenAPI contract describe configuration-gated capability on the
current deployment; they do not claim a successful provider lifecycle. The
prerecorded product-film narration is a separate asset generated locally with
Kokoro. Its no-charge ElevenLabs preflight made one quota-check GET, was denied,
made zero synthesis POSTs, and was not retried. AssemblyAI is used for
interactive transcription, not film narration.

Authoritative references:

- [KeeperHub workflow import/export](https://docs.keeperhub.com/workflows/import-export)
- [KeeperHub node types and Send Webhook](https://docs.keeperhub.com/keepers/overview)
- [KeeperHub API authentication](https://docs.keeperhub.com/api/authentication)
- [KeeperHub Direct Execution API](https://docs.keeperhub.com/api/direct-execution)
- [KeeperHub Hub](https://docs.keeperhub.com/workflows/hub)
- [KeeperHub Marketplace](https://docs.keeperhub.com/workflows/marketplace)

## Trust boundary

```text
KeeperHub workflow Send Webhook
  -> FINALTab observer (scoped bearer + rate/size limits)
  -> GET KeeperHub direct-execution status with server-held kh_ key
  -> fail-closed KeeperHub receipt classification
  -> independent Base Sepolia receipt, block, success, and exact indexed V2 settlementId + ledgerHash check
  -> VERIFIED_SETTLED only if both checks pass
```

KeeperHub's Send Webhook documentation supports HTTPS, headers, and JSON payloads
but does not document an outbound HMAC signature. The template therefore uses a
long, scoped FINALTab bearer token in its configured Authorization header. This
is not called a signed webhook. Even with valid authentication, the callback is
only a wake-up signal: the endpoint ignores any caller-supplied status, receipt,
transaction hash or contract address. It accepts the execution ID plus the expected frozen settlementId and ledgerHash, then checks all three against freshly fetched data.

The observer is replay-safe because it is read-only. It neither broadcasts nor
changes a settlement. Keep its returned observation in the caller's audit log.
The Supabase production project has its four baseline plus additive `52236`,
`60000`, `64822`, `73000`, `74000`, `20260812023200`, and `20260812090000`
migrations applied and schema-verified at 31/31 public RLS tables. The new
narration-generation and tab-draft tables have zero policies and fail closed to
browser roles. Sensitive mutation RPCs are service-role-only, the
unindexed-FK warning is cleared, and advisors have zero error-level findings
with reviewed warnings remaining. Post-promotion cutover `74500` is applied.
Canonical deployment `dpl_58fvFVcAAUFpP55Pi1aYTp3ot6Fi` at commit
`cb8b6484427d30cb31a0a2dd511e617ff42dda06` is `READY`; the observer's
callback/audit path remains unclaimed until separately live-probed.

Value-moving first-party UI, REST, and MCP calls are separate from this read-only
observer and converge on the applied `74000` durable-journal schema. A durably accepted
retry returns its recorded execution without another simulation or execute; a
prepared recovery reuses the stored successful simulation and deterministic
KeeperHub idempotency key under a bounded approval expiry. New first-party work
also requires current database approvals and a valid wallet approval at the
final pre-broadcast gate.

## Configure a deployment

1. Set `NEXT_PUBLIC_SETTLEMENT_CONTRACT` to the KeeperHub-deployed V2 address
   `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB` and
   `FINALTAB_SETTLEMENT_CONTRACT_VERSION=2`. Deployment execution
   `xasakw5nfxkh2s0fh4stn` landed at block `45321107`; Sourcify exact-match ID
   is `43497805`. If the address or version is missing or malformed, discovery
   reports `ready: false` and settlement routes remain blocked.
2. Set `FINALTAB_APP_ORIGIN` to the canonical HTTPS origin. Discovery falls back
   to the request origin, but a pinned value prevents proxy Host headers from
   rewriting generated integration URLs.
3. Create a long random FINALTab token. Store only its SHA-256 digest in
   `FINALTAB_API_TOKENS_JSON` with the `settlements:read` scope. The raw token is
   entered once in the imported KeeperHub Send Webhook node and never committed.

   Example configuration shape (the digest below is deliberately a placeholder):

   ```json
   [
     {
       "name": "keeperhub-proof-observer",
       "subject": "keeperhub-workflow",
       "tokenSha256": "REPLACE_WITH_64_LOWERCASE_HEX_CHARACTERS",
       "scopes": ["settlements:read"]
     }
   ]
   ```

4. Download `/integrations/keeperhub/workflow`, or upload the version-controlled
   `.workflow.json` file from this repository. KeeperHub's documented export
   format has six top-level keys: `version`, `exportedAt`, `workflow`, `nodes`,
   `edges`, and `integrationBindings`; the template follows schema version `1`.
5. In the imported private workflow, replace
   `REPLACE_WITH_FINALTAB_SCOPED_TOKEN`, confirm the callback origin, and save.
6. Keep the workflow disabled until its token, URL, and a real execution ID have
   been tested. KeeperHub's own CLI documentation warns that successful creation
   is not evidence that a workflow runs. Validate and run it before enabling.
7. Trigger it with a webhook body such as:

   ```json
   {
     "executionId": "REPLACE_WITH_A_REAL_KEEPERHUB_EXECUTION_ID",
     "settlementId": "0x_REPLACE_WITH_THE_EXACT_32_BYTE_PLAN_HASH",
     "ledgerHash": "0x_REPLACE_WITH_THE_EXACT_32_BYTE_LEDGER_HASH"
   }
   ```

   The KeeperHub workflow forwards those three identifiers to FINALTab. A non-terminal run
   produces HTTP `202`; a terminal observation produces HTTP `200`. Read the
   response's `verdict`, not a bare transaction hash.

## KeeperHub credential roles

- `kh_...`: organization key, server-side only. FINALTab uses this for KeeperHub
  Direct Execution and status re-fetches.
- `wfb_...`: user-scoped key used by a caller to trigger a KeeperHub workflow's
  own webhook endpoint. It is not a Direct Execution credential.
- `ft_...` (recommended naming only): opaque FINALTab scoped token. KeeperHub's
  Send Webhook action presents it to the FINALTab observer; only its digest is
  stored by FINALTab.

Never put `kh_`, `wfb_`, or raw FINALTab tokens in the repository, workflow
export, browser bundle, screenshots, or video.

## Hub, Marketplace, and website embedding

The proof-observer workflow is suitable for private import and, after a real
test, Hub sharing. Hub publication must be performed by a KeeperHub organization
owner; imported copies have their integration bindings cleared by KeeperHub.

It is **not** presented as a paid Marketplace listing. KeeperHub's documented
Marketplace flow requires an enabled, tested workflow with a permanent slug and
declared input/output schemas; publication also creates public registry and
payment consequences. That needs explicit owner approval and cannot be completed
from source code alone.

There is no claimed iframe partnership. The discovery document advertises an API,
MCP server, workflow template, and deep link. Embedding the UI inside a KeeperHub
website requires KeeperHub to provide the exact parent origin and approve the
frame/CSP, cookie, accessibility, and support contract. Until then, cross-origin
iframe support remains deliberately undeclared.

## External blockers

- KeeperHub organization access to import, validate, enable, and optionally
  publish the workflow.
- A live production MCP human-approval and submission probe remains unclaimed.
  The public film stops before signing, submission, broadcast, or value movement;
  its read-only retained-settlement lane is separate. The live one-atomic-unit
  run proves the rail but did not exercise the MCP human broadcast-challenge
  path.
- Production `kh_` and scoped FINALTab credentials, entered server-side/by the
  KeeperHub owner and never committed.
- A post-deploy Supabase callback/audit persistence probe if durable callback
  rows are claimed.
- KeeperHub approval and a fixed parent origin for any iframe embedding.
