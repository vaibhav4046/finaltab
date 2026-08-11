# COMPOSITION PLAN — FINALTab winner film

## Master

- Composition ID: `finaltab-winner`
- Duration: 96 seconds
- Canvas/delivery: 3840×2160
- Frame rate: 60 fps
- HyperFrames: 0.7.106
- Palette and typography: [frame.md](frame.md)
- Motion assertions: one root [index.motion.json](index.motion.json), 27 targeted assertions

## Frame schedule

| Frame | Composition | Start | Duration | Evidence role |
| --- | --- | ---: | ---: | --- |
| 01 | `finaltab-outcome-lockup` | 0 | 6 | human outcome |
| 02 | `finaltab-architecture-rail` | 6 | 10 | five control boundaries |
| 03 | `finaltab-complex-product-flow` | 16 | 15 | canonical signed-in product capture |
| 04 | `finaltab-net-freeze-bind` | 31 | 13 | review invalidation and freeze |
| 05 | `finaltab-dual-consent-simulate` | 44 | 12 | sanitized retained signature/simulation evidence |
| 06 | `finaltab-keeperhub-proof` | 56 | 10 | retained KeeperHub + independent chain proof |
| 07 | `finaltab-nine-mcp-tools` | 66 | 7 | authenticated nine-tool surface |
| 08 | `finaltab-mcp-climax` | 73 | 18 | non-broadcast MCP boundary + separate retained status |
| 09 | `finaltab-proof-cta` | 91 | 5 | public URLs and retained transaction |

## Tracks

| Track | Role |
| ---: | --- |
| 0 | master ground |
| 10 | frame subcompositions |
| 15 | eight receipt-paper wipes |
| 20 | baked captions |
| 30 | nine scene narration clips |
| 32 | transition whooshes |
| 33 | proof ping |
| 34 | approval-boundary click |
| 35 | climax riser |
| 36 | CTA impact |

No BGM track is present because no music source is approved.

## Transition and layout contract

Eight 0.5-second receipt-paper wipes straddle the cuts at 6, 16, 31, 44, 56, 66, 73, and 91 seconds. The enhanced audit samples those transitions.

Narrow annotations only:

- `#caption-layer[data-layout-allow-caption-zone]`
- `#f02-world[data-layout-allow-overflow]`
- transition occlusion on Frame 2 heading, counter, stations 2 and 4
- transition occlusion on the Frame 8 rail

No broad layout ignore is allowed.

## Audio and captions

- Existing unchanged narration: scenes 1, 2, 7, 9.
- Pending selective regeneration: scenes 3, 4, 5, 6, 8.
- `generate-voiceover.mjs` refuses unchanged scenes and requires the explicit changed-scene set.
- `build-captions.mjs` consumes local alignment files and atomically updates SRT, VTT, cue JSON, baked caption HTML, voice clip durations, and hashes.
- `data/audio-manifest.json` locks every local SFX byte/hash and cue.
- SFX volumes are 0.12–0.24 under narration.

## Capture promotion

Machine-readable contracts live in `data/capture-contracts.json`; approved capture hashes live in `data/capture-lock.json`. The source currently references build-time slots, so final render remains blocked.

## Actual source layout

```
video/finaltab-winner/
  index.html
  index.motion.json
  frame.md
  SCRIPT.md
  STORYBOARD.md
  CAPTIONS.srt
  CAPTIONS.vtt
  data/
    release-proof.json
    capture-contracts.json
    capture-lock.json
    voiceover-manifest.json
    caption-cues.json
    audio-manifest.json
  assets/
    audio/voice/
    audio/sfx/
    capture-slots/
    fonts/
    vendor/
  compositions/frames/01..09
  generate-voiceover.mjs
  build-captions.mjs
  verify-video-gates.mjs
```

## Verification and render commands

```powershell
npm run check:source
npm run check:enhanced
node verify-video-gates.mjs
npm run render:final
```

The third command must pass before the fourth is allowed. The final command renders PNG video frames at native 4K60 with strict checks, no best-effort fallback, low-memory mode, and frame caching disabled.
