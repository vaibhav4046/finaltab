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
| 15 | eight carbon–blue–acid transit wipes |
| 20 | baked captions |
| 30 | nine scene narration clips |
| 32 | transition whooshes |
| 33 | proof ping |
| 34 | approval-boundary click |
| 35 | climax riser |
| 36 | CTA impact |

No BGM track is present because no music source is approved.

## Transition and layout contract

Eight 0.5-second carbon–blue–acid transit wipes straddle the cuts at 6, 16, 31, 44, 56, 66, 73, and 91 seconds. The enhanced audit samples those transitions.

Narrow annotations only:

- `#caption-layer[data-layout-allow-caption-zone]`
- `#f02-world[data-layout-allow-overflow]`
- transition occlusion on Frame 2 heading, counter, stations 2 and 4
- transition occlusion on the Frame 8 rail

No broad layout ignore is allowed.

## Audio and captions

- Retained narration: scenes 1, 2, 7, and 9 use the approved ElevenLabs Multilingual v2 MP3s and provider-native timing.
- Changed narration: scenes 3, 4, 5, 6, and 8 use the selected Flash v2.5 MP3s generated with one call per selected exact text across three protected, expiring, fixed-scene Vercel release candidates, plus provider-free offline alignment. Four over-budget attempts are recorded as superseded, for nine provider calls total. The canonical product alias `finaltab.vercel.app` was never promoted to those candidates.
- `data/narration-generation-ledger.json` is sanitized and credential-free; both the synchronizer and final gate bind it to the exact three deployment IDs, helper contract, voice, selected scene set, and MP3 byte/SHA values, and verify the superseded-attempt accounting.
- `generate-voiceover.mjs` is a fail-closed retirement guard. No video-project command calls a narration provider or reads a provider key.
- `npm run voice:check` validates the complete local package without writing; `npm run voice:sync` restores retained alignment files and writes the hybrid manifest without a network request.
- `build-captions.mjs` consumes local alignment files and atomically updates SRT, VTT, cue JSON, baked caption HTML, voice clip durations, and hashes.
- `data/audio-manifest.json` locks every local SFX byte/hash and cue.
- SFX volumes are 0.12–0.24 under narration.

## Capture promotion

Machine-readable contracts live in `data/capture-contracts.json`; approved capture hashes live in `data/capture-lock.json`. All canonical capture assets are installed and the final gate rechecks every byte, resolution, frame rate, and minimum duration before render.

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
    narration-generation-ledger.json
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
  generate-voiceover.mjs  # retired, fail-closed provider guard
  scripts/align-narration.py
  scripts/sync-route-voice-manifest.mjs
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
