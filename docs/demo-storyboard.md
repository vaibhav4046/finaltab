# FINALTab V2 product video storyboard — proof pending

This is a recording plan, not evidence. Target timing is editorial guidance and
must never be copied into submission metadata. The final duration, checksum,
and public URL remain **PENDING** until a completed render is measured.

The canonical video must use one authenticated external-wallet V2 settlement
and the matching trace defined in
[release/MCP_TRACE_SPEC.md](release/MCP_TRACE_SPEC.md). If that settlement does
not exist, do not manufacture a green state or substitute the historical V1
transaction without an explicit “historical V1” label.

## Creative spine

Target: roughly 100–120 seconds, premium dark ledger aesthetic, decisive pacing,
captions that work without audio, and narration synchronized to visible state.

| Target | Beat | Required on-screen truth |
|---|---|---|
| 0:00–0:06 | Logo reveal | FINALTab mark, “Receipt → consent → landed proof” |
| 0:06–0:16 | Problem | Shared receipt, fragmented IOUs, risk of an agent broadcasting without human consent |
| 0:16–0:28 | Architecture | Model interprets; deterministic engine reconciles; wallets consent; KeeperHub executes; RPC verifies |
| 0:28–0:43 | Product use case | Upload/allocate a complex receipt; shares reconcile exactly; debt graph nets deterministically |
| 0:43–0:54 | Freeze and V2 | Ledger hash plus full-plan hash; V2 address `0x7b58791c…cCDB`; dual signature model |
| 0:54–1:10 | Authenticated MCP | Real client initializes with a redacted scoped token, lists current tools, calls `allocate_receipt` and `prepare_receipt_settlement` |
| 1:10–1:25 | External wallets | Debtors sign USDC `ReceiveWithAuthorization` and FINALTab `SettlementConsent`; no server-held user keys |
| 1:25–1:38 | Safety boundary | `simulate_signed_settlement`, then short-lived broadcast challenge; human wallet reviews and `personal_sign`s it |
| 1:38–1:52 | KeeperHub execution | `submit_signed_settlement`, execution ID, poll, verified successful receipt; no long dead wait |
| 1:52–2:02 | Independent proof | Base Sepolia tx, block, V2 `SettlementExecuted` event, exact balance deltas, conservation |
| 2:02–2:10 | Close | Sourcify exact-match deployment proof, reusable KeeperHub/MCP integration, repository and video URL |

## Scene requirements

### 1. Architecture must be explicit

Animate five separate lanes rather than one vague “AI settles” arrow:

```text
receipt/model interpretation
→ deterministic integer engine
→ debtor wallet consent
→ KeeperHub simulation and execution
→ independent RPC + exact settlementId/ledgerHash verification
```

Narration must not imply that the model controls arithmetic, holds keys, or
decides when value moves.

### 2. Show the current MCP tools, not the V1 surface

The production story uses:

```text
allocate_receipt
prepare_receipt_settlement
simulate_signed_settlement
create_broadcast_approval_challenge
submit_signed_settlement
settlement_status(executionId, settlementId, ledgerHash)
```

The token must be present for the real request but fully redacted from the
screen and trace. Do not show `get_balances`, `prepare_settlement`,
`settle_tab(confirm: true)`, or “seven tools” as the current flow.

The three `demo_*` tools may appear only in a clearly labelled appendix or
failure-mode beat explaining that fixed-wallet fixtures are disabled by
default. They must not masquerade as the product workflow.

### 3. Consent must be visible and accurate

Show both debtor typed-data requests and the separate broadcast approval:

- Circle USDC `ReceiveWithAuthorization`;
- FINALTab V2 `SettlementConsent`, bound to the full debit/payout plan; and
- short-lived EIP-191 approval bound to authenticated principal, chain,
  contract, ledger, and settlement.

The voiceover should say “wallet-signed approval,” not “confirm true.” Never
show private keys, seed phrases, raw bearer tokens, or secret-bearing browser
panels.

### 4. Proof must be from the same run

The video, redacted MCP JSONL, KeeperHub execution ID, transaction hash, block,
V2 event, and before/after balances must share one `runId`. A V2 deployment tx
is useful architecture proof but cannot stand in for the product settlement.

Current deployment proof that may be shown accurately:

- V2 contract: `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`;
- KeeperHub deployment execution: `xasakw5nfxkh2s0fh4stn`;
- deployment tx: `0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f`;
- block: `45321107`;
- Sourcify: exact creation/runtime match, ID `43497805`.

The V2 settlement execution and transaction remain **PENDING** and must be
inserted only after the run exists.

## Voice and edit gate

- [ ] Narration text matches the action visible in that exact second.
- [ ] Captions are verbatim, synchronized, and within safe margins.
- [ ] Network waits are compressed without hiding errors or changing order.
- [ ] Failure/recovery calls remain in the trace even if the edit summarizes them.
- [ ] Every hash or address held on screen is legible long enough to verify.
- [ ] Music never masks narration; SFX reinforce state transitions rather than
      implying success early.
- [ ] Final file passes manual frame review and secret scan.

## Historical V1 appendix — not current footage

A 101.64-second V1 master and an earlier 92.7-second cut were recorded in 2026.
The retained notes describe fixed Vee/Hem/Ravi demo signers, the V1 contract
`0xCcf6…7e64`, and a successful V1 KeeperHub settlement. The files are absent
from this checkout and have no current public URL.

Historical V1 MCP evidence used seven former tools and `confirm: true`; execution
`69zzrj7z676u89ce1x76j`, tx `0x314189b4…c5eb`, block `45315909`. Preserve those
facts as V1 history only. They do not prove the V2 external-wallet flow or
satisfy the V2 video gate.
