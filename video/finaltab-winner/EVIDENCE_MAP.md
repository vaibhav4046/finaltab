# EVIDENCE MAP — claim to source

## Evidence records

| ID | State | Source | Supports |
| --- | --- | --- | --- |
| E01 | verified | `data/release-proof.json` | retained contract, execution, transaction, block, settlement ID, ledger hash, one-atomic-unit conservation |
| E02 | verified, sanitize before display | `proof-output/v2-live-settlement-2026-08-11T04-28-59-530Z.json` | two public-key recoveries, successful pre-broadcast simulation, consumed settlement and nonce |
| E03 | source-proven | production MCP implementation and Frame 7 canonical tool list | exactly nine tools, external-wallet boundary |
| E04 | pending capture | C03 | real account return, scan/edit, user-entered participants, exact allocation |
| E05 | pending capture | C04 | four-stage review, invalidation, fresh rerun, freeze |
| E06 | pending capture | C07 | authenticated live `tools/list` |
| E07 | pending capture | C08A | authenticated non-broadcast MCP sequence through challenge creation and stop |
| E08 | pending capture | C08B | separate read-only retained status or public proof |
| E09 | verified public | Base Sepolia transaction `0x7a6fb7…59a789` | independent settlement event and block 45327128 |
| E10 | source-locked | `data/audio-manifest.json` | local SFX license, hashes, cue times, no BGM |
| E11 | pending sync | voice/caption manifests | selective ElevenLabs regeneration and caption alignment |

## Frame mapping

| Frame | Claim | Evidence | Final requirement |
| --- | --- | --- | --- |
| 1 | exact shared-bill outcome | product thesis | no extra claim |
| 2 | five safety boundaries | source + E01/E03 | architecture only |
| 3 | signed-in receipt-to-allocation flow | E04 | C03 approved hash |
| 4 | current-input review then freeze | E05 | C04 approved hash |
| 5 | two verified signatures and earlier simulation | E01/E02 | sanitized C05 still |
| 6 | KeeperHub receipt matches chain proof | E01/E09 | C06A + C06B approved hashes |
| 7 | exactly nine production tools | E03/E06 | C07 approved hash |
| 8 | client stops before value movement; retained status is separate | E07/E08 | C08A + C08B approved hashes |
| 9 | public product/source/workflow/retained transaction | E01/E09 | final URL check |

## Retained-run separation

The retained transaction came from an explicitly authorized simulate-then-single-broadcast runner. It was not an MCP submission. Frames 6, 8, and 9 must retain this distinction in visible text.

## Unsupported claims excluded from the film

- A participant invitation or second-identity collaboration flow.
- A fresh wallet approval or settlement-submission chronology.
- An MCP client broadcasting the retained transaction.
- A successful retained `settlement_status` response unless the real read-only request is visibly authorized.
- Any participant name inferred from receipt content.
- Any new value move.

## Final evidence chain

```
canonical capture
  → capture contract
  → byte/dimension/fps probe
  → SHA-256 capture lock
  → truth flag
  → source gate
  → enhanced HyperFrames audit
  → strict 4K60 render
```
