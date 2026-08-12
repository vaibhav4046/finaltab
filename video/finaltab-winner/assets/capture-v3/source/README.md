# Genuine V3 screenshot source pack

This directory holds local screenshots captured from the canonical production product. The evidence composer fails closed until every required filename exists. It does not claim clicks, interactions, events, metrics, or voice success that are not visible in the supplied images.

## C05 product flow

- `landing-live.png`
- `app-home-live.png`
- `settlement-room-live.png`
- `durable-tab-live.png`
- `agents-memory-live.png`
- `proofs-live.png`
- `developers-live.png`
- `open-source-live.png`

## C06 complex agent task

- `agent-run-detail-live.png`
- `agent-stages-live.png`
- `agent-proof-stage-live.png`
- `agent-balance-live.png`
- `agents-memory-live.png`

Each browser screenshot must decode as PNG, JPEG, or WebP, be at least 800x600, and have unique bytes. (The browser bridge can return JPEG bytes even when a capture filename ends in `.png`; the composer sniffs the real byte format.) C05 is visibly labelled `REAL CANONICAL PRODUCT SURFACES / CAPTURED 12 AUG 2026`. C06 places sanitized live MCP input facts in one lane and the real retained product run in a second lane labelled `NOT THE LIVE MCP RECEIPT`; it does not imply they are the same run. The resulting 1440p60 videos still require a separate named independent review in `data/capture-attestations.json`; this generator never creates or approves an attestation.

Run one lane at a time:

```powershell
npm run capture:compose:v3 -- --only C05
npm run capture:compose:v3 -- --only C06
npm run capture:compose:v3 -- --only C07
npm run capture:compose:v3 -- --only C08
```

The C07 and C08 lanes use only the sanitized local transcript and the locked local release-proof facts. They make no browser, network, provider, KeeperHub, wallet, signing, submission, broadcast, or value-moving call.
