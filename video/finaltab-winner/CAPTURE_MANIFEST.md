# CAPTURE MANIFEST — canonical production evidence

The machine-readable authority is [data/capture-contracts.json](data/capture-contracts.json). This document explains how to execute it safely.

## Absolute restrictions

- Do not call any value-moving endpoint.
- Do not request or create a wallet signature.
- Do not replay the retained settlement or its consumed authorization.
- Do not expose bearer tokens, private keys, signature bytes, email addresses, or local secret files.
- Do not fabricate product UI, MCP output, receipt content, participant identities, or proof results.
- The retained settlement must always be labelled as separate from the filmed MCP session.

## Capture matrix

| ID | Canonical artifact | Source | Autonomous after production promotion | Human contingency |
| --- | --- | --- | --- | --- |
| C03 | `assets/capture/C03-complex-product-flow.mp4` | production product | yes | GitHub MFA or first consent only |
| C04 | `assets/capture/C04-net-freeze-bind.mp4` | production product | yes | none after auth |
| C05 | `assets/capture/C05-retained-signature-simulation.png` | sanitized retained evidence | yes | none |
| C06A | `assets/capture/C06-retained-keeperhub-receipt.png` | retained KeeperHub receipt | yes, read only | none |
| C06B | `assets/capture/C06-base-sepolia-proof.png` | public explorer or independent RPC | yes, read only | none |
| C07 | `assets/capture/C07-live-tools-list.png` | developers page + authenticated MCP | yes | none |
| C08A | `assets/capture/C08-mcp-nonbroadcast.mp4` | real named MCP client | yes | none |
| C08B | `assets/capture/C08-retained-status.png` | separate read-only retained status or public proof | yes, read only | none |

## C03 — real product flow

Show a canonical account return or an already-authenticated state, receipt scan/upload, one real correction, user-entered participants, allocation, and exact receipt reconciliation. Do not show a collaboration invitation unless a separate multi-identity production probe has independently established it; this film does not require that claim.

## C04 — four-stage review and freeze

Show extraction, allocation arithmetic, consent risk, and proof preflight in order. Edit an upstream input after a completed review, show the review become stale, rerun it, then freeze the current plan. The freeze view must bind ledger hash, settlement ID, debits, payouts, chain, and contract.

## C05 — sanitized retained evidence

Build a still from public verification fields in the retained record. It may show recovered signer addresses and digests, but must omit full signature bytes. It must state that the successful KeeperHub simulation occurred before the single authorized broadcast and that the plan and authorization nonce are consumed.

## C06 — two read-only witnesses

Use a retained KeeperHub terminal receipt and a public Base Sepolia explorer or independent RPC view. Both must show the retained transaction, not the deployment transaction. The settlement ID and ledger hash must match `data/release-proof.json`.

## C07 — live tool surface

Use a least-privileged MCP token outside the recording frame. Capture authenticated `tools/list` with exactly nine production tools. Redact the authorization header; do not crop away the canonical endpoint identity.

## C08 — safe MCP boundary plus retained status

C08A may call only authenticated, non-value-moving tools through `create_broadcast_approval_challenge`, then stop before any wallet action. C08B must be a visibly separate read-only retained status or public-proof panel. If the production status endpoint does not authorize the retained execution, show the failed read-only request truthfully and use public proof for the verified state; never synthesize a successful MCP response.

## Promotion and hash lock

1. Copy only captures that satisfy their contracts into the exact canonical paths.
2. Replace all build-time capture slots and pending labels in Frames 3–8.
3. Update the four truth flags in `data/release-proof.json` only after their evidence exists.
4. Set `data/capture-lock.json` to `approved-canonical-captures`, record UTC approval time, and add each capture ID, path, byte length, and SHA-256.
5. Run `node verify-video-gates.mjs`; it validates hashes, still dimensions, video dimensions, frame rate, and minimum duration.

A final render is forbidden while any slot, pending flag, or capture-hash mismatch remains.
