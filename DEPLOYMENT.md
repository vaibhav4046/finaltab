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

Supply `KEEPERHUB_API_KEY`, provider keys, Supabase credentials (including the
server-only `SUPABASE_SECRET_KEY` used for trusted financial and paid-voice RPCs),
`FINALTAB_API_TOKENS_JSON`, `FINALTAB_AGENT_ATTESTATION_SECRET`, and
`FINALTAB_PROOF_SIGNING_SECRET` only through server-side secret storage. Store
only FINALTab token SHA-256 digests. Both signing values must be independently
generated with at least 32 random bytes and must never use a `NEXT_PUBLIC_`
prefix. The current production source has exactly nine MCP tools and no
fixed-wallet money path.

The hosted Supabase project currently verifies at 19 RLS-enabled tables, 45
policies, zero anonymous table grants, and 34/34 indexed foreign keys. Review and
apply these additive migrations individually and in order:

1. `20260811052236_settlement_agent_control_plane.sql`;
2. `20260811064822_voice_spend_reservations.sql`;
3. `20260811073000_durable_first_party_settlement_flow.sql`; and
4. `20260811074000_durable_submission_intents.sql`.

Do not run a blind schema push: the hosted migration timestamps differ from the
local filenames. Repeat table/RLS/policy/grant/index and RPC-authority
measurements after each exact file. Deploy and probe the candidate before
applying `20260811074500_financial_truth_post_promotion_cutover.sql`; that final
migration revokes legacy direct financial writes and the old request-count-only
voice RPC, plus all browser-role `TRUNCATE`, `REFERENCES`, `TRIGGER`, and
`MAINTAIN` privileges in `public`; it is deliberately post-promotion.

The `74000` journal is the common durability boundary for first-party UI, REST,
and MCP value submission. A recorded `accepted` retry must return its execution
without simulation or execution. A `prepared` retry must reuse the persisted
successful simulation and deterministic KeeperHub idempotency key under the
bounded approval expiry. New first-party work must still pass its current
database approval check and wallet approval immediately before broadcast.

After deploying the web service, verify:

1. discovery reports the V2 address and readiness;
2. anonymous MCP requests are rejected;
3. a scoped redacted token can initialize and list exactly nine tools;
4. production tools request external wallet signatures;
5. first-party Freeze rejects a missing or stale attested review; and
6. no token, provider secret, or attestation secret appears in logs or browser
   bundles.

Privy remains fail-closed until its production app, Supabase JWKS custom-auth
connection, exact allowed domain, identity tokens, app ID, and verification key
are configured and probed. The branded `/auth/complete` return page is ready;
branded inbound email additionally needs custom SMTP or a Send Email Hook backed
by a verified sender domain.

## Proven V2 live settlement

Deployment proof is not settlement proof. A separate, explicitly authorized
Base Sepolia V2 proof has now closed the value-moving rail gate:

| Field | Proven value |
|---|---|
| KeeperHub execution | `3hmlqi36zweiwg6fc5o2u` |
| Transaction | `0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789` |
| Block | `45327128` |
| Amount | `1` USDC atomic unit (`0.000001` USDC) |
| Result | verified receipt, exact V2 event binding, debtor `-1`, creditor `+1`, contract `0`, conservation delta `0` |
| Evidence | `docs/release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json` |

Do not rebroadcast that run. For the final production MCP capture, exercise the
non-destructive status/proof surfaces against its retained identifiers and show
the product authorization sequence accurately:

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

Retain the redacted trace alongside the existing KeeperHub execution/receipt,
independent Base Sepolia receipt, V2 event, and exact balance deltas. The proof
run used an explicitly authorized simulate-then-single-broadcast runner; do not
imply it exercised the production MCP human broadcast challenge. Follow
`docs/release/MCP_TRACE_SPEC.md` and keep that boundary visible.

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
