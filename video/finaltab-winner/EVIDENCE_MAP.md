# FINALTab video evidence map

**Rule:** an implementation artifact can justify architecture language; only a retained live run can justify a live outcome. A green state in the film must trace to the exact run visible in that frame.

## Evidence ledger

| ID | Status | Claim allowed in the film | Canonical source | Required on-screen qualifier |
|---|---|---|---|---|
| `P01` | DESIGN FACT | FINALTab has a custom receipt-edge mark and a Ledger Noir visual system. | `apps/web/components/FinalTabMark.tsx`, `video/finaltab-winner/DESIGN.md` | none; this is identity, not product proof |
| `E01` | LIVE PROVEN | `FinalTabBatchSettlementV2` is deployed on Base Sepolia through KeeperHub at `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`; deployment tx `0x904ec881...e8f`; block `45321107`; Sourcify creation/runtime exact match, match ID `43497805`. | `docs/release/evidence/v2-deployment-2026-08-11T01-08-17-421Z.json` JSON paths `keeperHub.*`, `deployment.*`, `sourceVerification.*` | `CONTRACT DEPLOYMENT · NOT A SETTLEMENT` |
| `E02` | SOURCE + TEST PROVEN | V2 binds chain, contract, token, ledger, full debits, and full payouts; each debtor supplies Circle `ReceiveWithAuthorization` plus FINALTab `SettlementConsent`; duplicate/replay cases fail. | `contracts/contracts/FinalTabBatchSettlementV2.sol`, `contracts/test/FinalTabBatchSettlementV2.test.js`, `packages/engine/src/settlementPlan.ts` | `V2 PLAN BINDING`; never “audited” or “mainnet” |
| `E03` | SOURCE + TEST PROVEN; LIVE RECHECK PENDING | The MCP server defines nine production tools and three explicit `demo_*` tools. `settlement_status` requires `executionId`, `settlementId`, and `ledgerHash`, then requests independent exact-event proof. | `apps/web/app/api/mcp/route.ts`, `apps/web/lib/server/mcpSettlement.ts`, `apps/web/test/mcpSettlement.test.ts`, `docs/release/MCP_TRACE_SPEC.md` | `9 PRODUCTION · 3 TESTNET DEMO TOOLS DISABLED BY DEFAULT` |
| `E04` | SOURCE IMPLEMENTED; FINAL DEPLOY CAPTURE PENDING | The product supports editable receipt extraction, arbitrary participants/live wallets, natural-language allocation, cent-perfect reconciliation, netting, freeze, dual signatures, simulation, KeeperHub execution states, and dynamic proof routing. | `apps/web/components/ReceiptPanel.tsx`, `ParticipantSetup.tsx`, `SplitPanel.tsx`, `ExecutionRail.tsx`, `Capsule.tsx`, `apps/web/lib/flow.ts` | show only the final deployed implementation; source alone does not prove production configuration |
| `E05` | CONDITIONAL SOURCE IMPLEMENTED | Signed-in cloud tabs, participants, expiring hashed invites, approval states, and audit history exist in source; device-local fallback is explicit. | `apps/web/components/CloudTabsPanel.tsx`, `CloudCollaborationPanel.tsx`, `apps/web/lib/server/tabCollaboration.ts`, `supabase/migrations/20260811003158_production_tenancy_and_approvals.sql` | show “durable across devices” only when production Supabase health and a logged-out invite test pass; otherwise show the honest disabled state |
| `E06` | SOURCE + TEST PROVEN; LIVE RECHECK PENDING | Production MCP uses scoped auth, external wallet signatures, short-lived wallet-signed broadcast approval, immediate re-simulation, idempotent KeeperHub submission, and fail-closed independent proof. | `apps/web/lib/server/apiAccess.ts`, `walletChallenge.ts`, `mcpSettlement.ts`, `settlementSubmission.ts`, corresponding tests, `docs/release/MCP_TRACE_SPEC.md` | never show a bearer credential; never use historical `confirm: true` |
| `E07-PENDING` | BLOCKING | A fresh V2 value-moving USDC settlement has completed through KeeperHub, exact indexed V2 event binding passed, balances conserved, and MCP/product/explorer artifacts agree. | future `proof-output/v2/<run-id>/mcp-trace.jsonl`, manifest, KeeperHub receipt, independent RPC proof, balance delta report | no claim or green frame until gate passes; deployment proof is forbidden as substitute |
| `E08-PENDING` | BLOCKING | Final public product, GitHub, MCP endpoint, KeeperHub integration, video URL, and fresh transaction link work logged out and describe one release. | future release manifest and link check | replace all placeholders before build/render |
| `E09` | SOURCE IMPLEMENTED; KEEPERHUB PUBLICATION NOT PROVEN | FINALTab exposes its own discovery JSON, OpenAPI document, Streamable HTTP MCP URL, KeeperHub observer workflow export, and deep link. | `apps/web/lib/integrations/keeperhubDiscovery.ts`, `apps/web/app/.well-known/`, `apps/web/app/openapi.json/`, `apps/web/app/integrations/keeperhub/workflow/` | `FINALTab-owned integration package`; do not claim KeeperHub Marketplace/Hub publication |

## Deployment-proof trap

The V2 deployment evidence contains a generic KeeperHub classifier field whose value is `VERIFIED_SETTLED`. In that JSON, the underlying transaction creates the V2 contract; it does not move participant USDC. The film may extract the deployment transaction, block, contract address, KeeperHub execution ID, runtime bytecode, or Sourcify match only when the graphic is visibly labeled `CONTRACT DEPLOYMENT · NOT A SETTLEMENT`. The following values are banned from Frames 6, 8, and the settlement line in Frame 9:

- KeeperHub execution `xasakw5nfxkh2s0fh4stn`;
- transaction `0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f`;
- block `45321107` when presented as a settlement block.

## Claim-to-frame map

| Frame | Visible claim | Evidence | Capture/build gate |
|---|---|---|---|
| 1 | a shared bill should end in certainty | product thesis from `BRIEF.md`; no factual performance claim | generated vector only |
| 2 | receipt -> deterministic ledger -> full-plan dual consent -> KeeperHub -> independent proof | `E01`, `E02`, `E03` | V2 facts locked; deployment label mandatory |
| 3 | editable complex receipt, arbitrary participants, cent-perfect allocation | `E04`; `E05` only if configured | `G-PRODUCT-FINAL`; optional cloud subsection separately gated |
| 4 | deterministic netting and immutable V2 plan binding | `E02`, `E04` | final deployed product plus captured values used by later run |
| 5 | two debtor signatures and simulate-before-broadcast | `E02`, `E03`, `E06` | real wallet recovery and real passed/failed simulations |
| 6 | fresh KeeperHub value movement plus independent exact-event proof | `E07-PENDING` | hard block: `G-V2-VALUE-MOVE` |
| 7 | nine production MCP tools, no arbitrary user keys held | `E03`, `E06` | live authenticated tools/list recheck |
| 8 | complete agent flow with human boundary and exact status arguments | `E03`, `E06`, `E07-PENDING` | hard block: `G-MCP-V2-SAME-RUN` |
| 9 | live verification routes and fresh transaction | `E01`, `E03`, `E08-PENDING`, `E09` | final public link check and same-run transaction |

## Exact MCP climax contract

Frame 8 must visibly preserve this order from `docs/release/MCP_TRACE_SPEC.md`:

```text
initialize
-> tools/list
-> allocate_receipt
-> prepare_receipt_settlement
-> each debtor signs ReceiveWithAuthorization + SettlementConsent
-> simulate_signed_settlement
-> create_broadcast_approval_challenge
-> human personal_sign / EIP-191
-> submit_signed_settlement
-> settlement_status({ executionId, settlementId, ledgerHash })
-> keeperhub.receipt
-> chain.proof
```

The canonical production trace must not call any `demo_*` tool. `confirm: true` is a historical V1 convention and is forbidden in narration, captions, capture, and submission claims.

## Green-state acceptance

`VERIFIED_SETTLED` may appear only when all of the following agree for one run:

1. KeeperHub status is terminal success.
2. Every KeeperHub receipt is chain-verified and successful on Base Sepolia.
3. Independent RPC re-fetch finds the receipt independently.
4. A V2 `SettlementExecuted` log came from the configured V2 contract.
5. The exact indexed `settlementId` equals the prepared/submitted identifier.
6. The exact indexed `ledgerHash` equals the frozen/prepared identifier.
7. Participant before/after balance deltas equal the signed debits/payouts.
8. Contract balance conservation holds.
9. The public explorer transaction, product proof capsule, MCP trace, and video overlays contain the same IDs.

If any condition is false or unavailable, the only allowed terminal labels are the source system's honest `FAILED`, `UNPROVEN`, or `PENDING` state.

## Stale evidence exclusions

- Every V1 contract, execution, transaction, video, demo signer, seven-tool trace, and `confirm: true` artifact is historical only.
- The V2 deployment is strong contract/deployment evidence but cannot close `E07-PENDING`.
- Old test counts are excluded until the final combined clean gate is recorded.
- BaseScan source verification is not claimed; Sourcify exact matching is proven.
- KeeperHub Marketplace/Hub publication is not claimed; only FINALTab-owned discovery/workflow assets are proven.
