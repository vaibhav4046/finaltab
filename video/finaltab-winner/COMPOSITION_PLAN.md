# COMPOSITION PLAN — FINALTab V3 judge film

## Master

- Composition ID: `finaltab-winner`
- Exact duration: 90.000 seconds / 5,400 frames
- Canvas and delivery: 3840×2160
- Frame rate: 60 fps
- HyperFrames pin: 0.7.106
- Current build state: all eight V3 scene compositions and seven source transitions are authored; promoted captures, narration, aligned captions, and final media verification remain pending
- Design truth: [frame.md](frame.md)
- Source truth: [data/v3-source-contract.json](data/v3-source-contract.json)

## Scene schedule

| Scene | Future composition | Start | Duration | End | Evidence role |
| --- | --- | ---: | ---: | ---: | --- |
| 01 | `finaltab-v3-logo` | 0 | 4 | 4 | text-only identity |
| 02 | `finaltab-v3-product-thesis` | 4 | 8 | 12 | product promise |
| 03 | `finaltab-v3-use-cases` | 12 | 8 | 20 | practical breadth |
| 04 | `finaltab-v3-simple-architecture` | 20 | 10 | 30 | plain-English mechanism |
| 05 | `finaltab-v3-real-site-demo` | 30 | 20 | 50 | real final product capture |
| 06 | `finaltab-v3-complex-agent-task` | 50 | 18 | 68 | voice, model, review, memory proof |
| 07 | `finaltab-v3-mcp-nonbroadcast` | 68 | 17 | 85 | authenticated tool test and hard stop |
| 08 | `finaltab-v3-proof-cta` | 85 | 5 | 90 | earlier-run proof and CTA |

## Planned root tracks

| Track | Role |
| ---: | --- |
| 0 | persistent carbon ground |
| 10 | eight newly built scene compositions |
| 15 | seven restrained carbon/blue/acid handoffs |
| 20 | captions |
| 30 | one new full-script George narration master |
| 32 | quiet transition SFX |
| 33 | hard-stop click and proof ping |

There is no BGM track. The final program is mastered to −14.0 LUFS integrated with true peak at or below −1.0 dBTP.

## Capture promotion

Only the four V3 paths in `data/capture-contracts.json` may satisfy this cut. Existing V2 film captures and narration remain unreferenced and cannot satisfy the V3 gate. Each V3 file must be hashed into `data/capture-lock.json` after manual inspection.

## Voice promotion

The complete 188-word script is generated once with George and `eleven_multilingual_v2`. The selected master and its offline alignment are recorded in `data/narration-generation-ledger.json` and `data/voiceover-manifest.json`. The gate rejects any reused scene, second model, multiple selected provider calls, or text mismatch.

## Release path

```powershell
npm run check:source
npm run gate:render
npm run check:enhanced
npm run render:final
```

`check:source` is allowed to report explicit pending capture/audio/composition prerequisites. `gate:render` must fail until every V3 prerequisite is approved. `render:final` later renders a raw 4K60 picture, performs two-pass loudness normalization, and verifies the final 90-second master; none of those commands are run during this source rebuild.
