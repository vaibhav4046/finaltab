# FINALTab V2 product video storyboard — master rendered, published, verified

This is a recording plan, not evidence. Target timing below is editorial
guidance and must never be copied into submission metadata.

**Published master (verified live 2026-08-14).** The V2 master is at
<https://youtu.be/eXZACnOdt5w>, titled "FINALtab Product for KeeperHub -
Agents Onchain Hackathon". The player reports a 90.021 s duration and the page
metadata `PT1M31S`, both consistent with the recorded render:

| Property | Recorded |
|---|---|
| Duration | 90.005 s |
| Resolution | 3840×2160 |
| Frame rate | 60 fps |
| Frames | 5,400 H.264 video frames with AAC audio |
| Size | 35,617,576 bytes |
| SHA-256 | `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69` |

That master meets the 4K60 creative target below and runs 90 s against a 96 s
target. Its YouTube visibility is **Unlisted**, not listed-public: the link
resolves for anyone who has it, which satisfies a submission link, but the
video will not appear in search or on the channel.

**Do not confuse it with the local working file.** `proof-output/` holds
`finaltab-demo.mp4`, which `ffprobe` measures at 101.64 s, 1920×1080, 25 fps,
7,472,357 bytes, SHA-256
`de8aa3018f690cbf31ce1737924a0e59a1ca30bdd715489db5ff46459262fbb7`. That is a
different file with a different hash, and its 101.64 s duration matches the V1
master described in the appendix at the end of this document. It is **not** the
published V2 master and must never be cited as one. `proof-output/` is
gitignored, so neither file is obtainable from the repository.

The canonical video must anchor its onchain proof in the retained V2 settlement
and follow the trace discipline in
[release/MCP_TRACE_SPEC.md](release/MCP_TRACE_SPEC.md). The value run used an
explicitly authorized simulate-then-single-broadcast runner, not the production
MCP human-approval route. Show the authenticated MCP tools and status proof as
a separate, clearly labelled product surface; do not fabricate an MCP broadcast
or substitute the historical V1 transaction without an explicit “historical
V1” label.

## Creative spine

Target: 96 seconds, 3840×2160 at 60 fps, premium carbon/acid/blue ledger
aesthetic, decisive pacing, captions that work without audio, and narration
synchronized to visible state. The delivered master matches the format and
runs 90 s — see the table above.

| Target | Beat | Required on-screen truth |
|---|---|---|
| 0:00–0:06 | Wordmark reveal | Text-only FINALTab lockup, “Receipt → consent → landed proof” |
| 0:06–0:16 | Architecture | Model interprets; deterministic engine reconciles; bounded review agents attest; wallets consent; KeeperHub executes; RPC verifies |
| 0:16–0:31 | Real product | Create/sign in, branded return, durable tab, complex receipt correction, caller-entered names/wallets, exact allocation |
| 0:31–0:44 | Review and Freeze | Four fixed review stages; bounded audit memory; stale edit invalidation; durable receipt UUID; immutable V2 hashes |
| 0:44–0:56 | External wallets | Debtors sign `ReceiveWithAuthorization` and `SettlementConsent`; exact simulation passes; a real revert does not broadcast |
| 0:56–1:06 | KeeperHub proof | Human approval, KeeperHub receipt, independent exact-event and balance proof; retained run boundary visible |
| 1:06–1:13 | Nine-tool surface | Authenticated live `tools/list` shows exactly the current three-by-three production grid |
| 1:13–1:31 | MCP climax | Real named client prepares, pauses for wallet actions, simulates, obtains human approval, submits, and verifies with all three proof IDs |
| 1:31–1:36 | Close | Product, source, MCP, KeeperHub workflow, Sourcify, and transaction links |

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

The production story uses exactly these nine tools:

```text
split_equal
split_weighted
net_debts
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

Any retired fixed-wallet tool name means the wrong deployment was captured and
fails the release gate.

### 3. First-party review must be visible and bounded

Before the product's Freeze action, show the current attested run pass receipt
validation, allocation arithmetic, consent risk, and proof preflight. Stage four
is honestly skipped before submission. An upstream edit must visibly invalidate
the review. Describe memory only as bounded, expiring, user-deletable audit
memory; never call it self-evolving or imply that it rewrites policy/code.

### 4. Consent must be visible and accurate

Show both debtor typed-data requests and the separate broadcast approval:

- Circle USDC `ReceiveWithAuthorization`;
- FINALTab V2 `SettlementConsent`, bound to the full debit/payout plan; and
- short-lived EIP-191 approval bound to authenticated principal, chain,
  contract, ledger, and settlement.

The voiceover should say “wallet-signed approval,” not “confirm true.” Never
show private keys, seed phrases, raw bearer tokens, or secret-bearing browser
panels.

### 5. Proof must be from the same run

The video, redacted status/proof capture, KeeperHub execution ID, transaction
hash, block, V2 event, and before/after balances must refer to the same retained
run. A V2 deployment tx is useful architecture proof but cannot stand in for
the product settlement. Do not imply that a later read-only MCP status call was
the original broadcaster.

Current deployment proof that may be shown accurately:

- V2 contract: `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`;
- KeeperHub deployment execution: `xasakw5nfxkh2s0fh4stn`;
- deployment tx: `0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f`;
- block: `45321107`;
- Sourcify: exact creation/runtime match, ID `43497805`.

Current V2 settlement proof that must be shown accurately:

- KeeperHub execution: `3hmlqi36zweiwg6fc5o2u`;
- transaction: `0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789`;
- block: `45327128`;
- amount: `1` USDC atomic unit (`0.000001` USDC);
- settlement ID: `0x8b670800d9856a90baa7492adefaf06ae86ac345d053db3dc7f01b065aadb9db`;
- ledger hash: `0x1581eb7f56485ff4d2a684a832fc8d085b9b0e5d8540c85e2d550e8f7b0cb91e`;
- balances: debtor `-1`, creditor `+1`, contract retained `0`, conservation
  delta `0`.

Source:
[release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json](release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json).

## Voice and edit gate

- [ ] Narration text matches the action visible in that exact second.
- [ ] Captions are verbatim, synchronized, and within safe margins.
- [ ] Network waits are compressed without hiding errors or changing order.
- [ ] Failure/recovery calls remain in the trace even if the edit summarizes them.
- [ ] Every hash or address held on screen is legible long enough to verify.
- [ ] Music never masks narration; SFX reinforce state transitions rather than
      implying success early.
- [ ] Final file passes manual frame review and secret scan.
- [ ] Final measured master is 3840×2160 at 60 fps; 1080p plates are references,
      not the submitted master.

## Historical V1 appendix — not current footage

A 101.64-second V1 master and an earlier 92.7-second cut were recorded in 2026.
The retained notes describe fixed Vee/Hem/Ravi demo signers, the V1 contract
`0xCcf6…7e64`, and a successful V1 KeeperHub settlement. The files are absent
from this checkout and have no current public URL.

Historical V1 MCP evidence used seven former tools and `confirm: true`; execution
`69zzrj7z676u89ce1x76j`, tx `0x314189b4…c5eb`, block `45315909`. Preserve those
facts as V1 history only. They do not prove the V2 external-wallet flow or
satisfy the V2 video gate.
