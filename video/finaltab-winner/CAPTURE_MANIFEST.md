# CAPTURE MANIFEST — FINALTab V3

Machine-readable authority: [data/capture-contracts.json](data/capture-contracts.json).

## Current state

All four canonical V3 captures are promoted and hash-locked under the approved independent automated visual-and-source audit. Existing captures from the rejected 96-second film remain superseded and cannot satisfy the V3 hash gate.

## Absolute restrictions

- Never request or create a wallet signature.
- Never call a sign, submit, broadcast, or value-moving operation.
- Never replay the earlier authorized settlement.
- Never expose a token, key, signature bytes, private email, or local secret.
- Never invent product UI, model output, review events, memory nodes, tool output, people, or proof.
- Always label the earlier settled transaction as separate from the filmed MCP test.

## Capture matrix

| ID | Canonical V3 path | Source | Minimum | Human contingency |
| --- | --- | --- | --- | --- |
| C05 | `assets/capture-v3/C05-final-site-demo.mp4` | canonical product | 2560×1440, 60 fps, 18s | GitHub MFA / first consent only |
| C06 | `assets/capture-v3/C06-complex-agent-task.mp4` | canonical Agent Control Center and loaded run | 2560×1440, 60 fps, 16s | none after auth |
| C07 | `assets/capture-v3/C07-mcp-nonbroadcast.mp4` | real named MCP client | 2560×1440, 60 fps, 15s | none |
| C08 | `assets/capture-v3/C08-retained-proof.png` | sanitized retained + public proof | 3200×1800 | none |

## C05 — real final site

Show the real route and connected workflow: sign in or account return, create a tab, upload and correct a receipt, enter people, assign items, include tax and tip, complete four checks, inspect balances and the loaded memory graph, and lock the reviewed plan. Private account text is redacted. No name is taken from the receipt.

## C06 — complex agent task

Use one real difficult task containing weighted items, shared service, exclusions, and a payer correction. The capture must show the actual voice state, model proposal, exact balanced result, four loaded review events, and evidence lineage into real compact memory. A missing stage stays missing; a missing voice event stays truthfully unavailable.

## C07 — MCP tool connection

Use an authenticated named client. Show initialize, the exact nine current tools, `allocate_receipt`, `prepare_receipt_settlement`, and `create_broadcast_approval_challenge`. Stop. Do not perform wallet action or any later mutation. The read-only earlier-run check appears in a visually separate lane.

## C08 — earlier authorized proof

Build only from the retained KeeperHub receipt and public Base Sepolia transaction. It must say `EARLIER AUTHORIZED RUN`, `READ ONLY`, and `NOT CREATED BY THIS MCP TEST`. Show the real transaction, block, settlement ID, and ledger hash without signature bytes.

## Promotion

1. Run `npm run capture:init-review -- data/capture-attestations.json` to create an exact contract-derived review worksheet.
2. Inspect each V3 artifact, complete every assertion, set reviewer/type/time, and change the worksheet status to `approved-independent-review`. The accepted reviewer type is `independent-automated-visual-and-source-audit`; it must bind visual inspection to the decoded media, sanitized source record, and exact contract assertions without claiming a human reviewer.
3. Run `npm run capture:promote -- --attestations data/capture-attestations.json`.
4. The promoter probes local media, rejects missing/undersized/short files and superseded V2 hashes, then records only the four canonical paths, byte sizes, SHA-256 values, media facts, review hash, and approval time in `data/capture-lock.json`.
5. Run `npm run check:source`, then `npm run gate:render`.

`capture-evidence.mjs` performs no browser automation, network request, MCP operation, wallet action, or value movement. Semantic truth requires a named independent review; technical/hash checks are automatic and fail closed. The reviewer type is recorded explicitly, so an automated audit is never mislabeled as human review.

The capture gate is satisfied only by those four promoted hashes; any later byte, attestation, truth-check, or path change fails closed.
