# COMPOSITION PLAN — FINALTab V3 judge film

## Master

- Composition ID: `finaltab-winner`
- Exact duration: 90.000 seconds / 5,400 frames
- Canvas and delivery: 3840×2160
- Frame rate: 60 fps
- HyperFrames pin: 0.7.106
- Current build state: all eight V3 scenes, four promoted captures, offline narration, aligned captions, corrected audio continuity, and the independently audited 4K60 final master are complete
- Design truth: [frame.md](frame.md)
- Source truth: [data/v3-source-contract.json](data/v3-source-contract.json)

## Scene schedule

| Scene | Composition | Start | Duration | End | Evidence role |
| --- | --- | ---: | ---: | ---: | --- |
| 01 | `finaltab-v3-logo` | 0 | 4 | 4 | text-only identity |
| 02 | `finaltab-v3-product-thesis` | 4 | 8 | 12 | product promise |
| 03 | `finaltab-v3-use-cases` | 12 | 8 | 20 | practical breadth |
| 04 | `finaltab-v3-simple-architecture` | 20 | 10 | 30 | plain-English mechanism |
| 05 | `finaltab-v3-real-site-demo` | 30 | 20 | 50 | real final product capture |
| 06 | `finaltab-v3-complex-agent-task` | 50 | 18 | 68 | typed input, model, review, memory proof |
| 07 | `finaltab-v3-mcp-nonbroadcast` | 68 | 17 | 85 | authenticated tool test and hard stop |
| 08 | `finaltab-v3-proof-cta` | 85 | 5 | 90 | earlier-run proof and CTA |

## Root tracks

| Track | Role |
| ---: | --- |
| 0 | persistent carbon ground |
| 10 | eight newly built scene compositions |
| 15 | seven restrained carbon/blue/acid handoffs |
| 20 | captions |
| 30 | one new full-script offline narration master |
| 32 | quiet transition SFX |
| 33 | hard-stop click and proof ping |
| 34 | project-generated Scene 05 room-tone continuity bridge |

There is no BGM track. The final program is mastered to −14.0 LUFS integrated with true peak at or below −1.0 dBTP.

## Capture promotion

Only the four V3 paths in `data/capture-contracts.json` may satisfy this cut. Existing V2 film captures and narration remain unreferenced and cannot satisfy the V3 gate. Each V3 file is hashed into `data/capture-lock.json` after an independent automated visual-and-source audit.

## Voice promotion

The complete 183-word script is synthesized locally with Kokoro `bm_george` after the no-charge ElevenLabs preflight denied generation. The selected master and exact-source timing map are recorded in `data/narration-generation-ledger.json` and `data/voiceover-manifest.json`. The gate rejects any reused scene, TTS provider call, or text mismatch.

## Release path

```powershell
npm run check:source
npm run gate:render
npm run check:enhanced
npm run render:final
```

`check:source` reports any explicit capture, audio, or composition blockers. `gate:render` fails closed unless every V3 prerequisite is approved. The release run passed both gates, rendered and mastered the 4K60 program, completed rendered-audio ASR and full decode checks, and received independent media audit GO.
