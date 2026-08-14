# VIDEO HANDOFF — FINALTab V3 judge film

## Frozen source

- Exact runtime: 90.000 seconds / 5,400 frames at 60 fps.
- Exact scene windows: `0–4`, `4–12`, `12–20`, `20–30`, `30–50`, `50–68`, `68–85`, `85–90`.
- Locked narration: 183 plain-English words across eight lines.
- Brand: Geist Sans headlines and wordmark; Geist Mono evidence; carbon / acid / electric blue; verified green for checked proof only.
- Audio requirement: one entirely new local Kokoro `bm_george` complete-script master; no old scene reuse or metered TTS provider calls; final mix −14.0 LUFS integrated and ≤ −1.0 dBTP.
- Safety: the MCP capture stops after approval-challenge creation. No wallet signature, submit, broadcast, or value movement. Earlier-run proof is separate and read only.

## Release status

1. Completed: four promoted and hash-locked V3 canonical captures, C05–C08.
2. Completed: new complete-script offline narration and exact-source timing map.
3. Completed: SRT, VTT, cue JSON, and baked captions from that timing map.
4. Completed: eight newly built V3 scene compositions and the final 90-second index.
5. Completed: V3 capture, narration, and local SFX hash promotion.
6. Completed: HyperFrames enhanced check, contact-sheet inspection, corrected render, two-pass loudness master, full decode, rendered-master verification, and independent media audit GO.

The authorized ElevenLabs quota preflight made one subscription GET and denied synthesis; it made zero TTS POSTs. The selected narration fallback is fully offline and makes zero provider requests.

## Verified final master

- Delivery artifact: `../../proof-output/finaltab-winner/finaltab-winner-90s-4k.mp4`
- Bytes / SHA-256: `35,617,576` / `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69`
- Picture: 3840×2160, 60 fps, 5,400 frames, 90.005 seconds, H.264 / yuv420p.
- Audio: AAC, 48 kHz stereo, −14.0 LUFS integrated, −3.8 dBTP.
- Verification: full decode passed; rendered-audio ASR WER 8.2%; independent media audit `GO`.

## Gate semantics

```powershell
npm run check:source
```

Validates the exact schedule, script, terminology, design tokens, manifests, capture contracts, SFX bytes, and render command. It prints a source pass and reports any explicit blockers.

```powershell
npm run gate:render
```

Strict mode. It now passes because captures, offline voice evidence, alignment, captions, eight new frames, the final index, and hash locks are approved; any later mismatch fails closed.

```powershell
npm run render:final
```

Reproduces the raw 4K60 render, masters the complete program to −14.0 LUFS, performs independent rendered-audio ASR, and checks container, streams, codecs, resolution, frame count, runtime, loudness, and true peak. Run it only while the strict prerequisite gate passes.

## Guarded execution order

These tools do not navigate a browser or perform MCP/wallet/value actions. The capture tool only validates and promotes already-created local files.

1. Create a review worksheet with `npm run capture:init-review -- data/capture-attestations.json`. Inspect all four local artifacts and their sanitized source records, change every exact assertion to `true`, add reviewer/type/time, and set the worksheet status to `approved-independent-review`. Use reviewer type `independent-automated-visual-and-source-audit`; do not label an automated review as human.
2. Promote only after review: `npm run capture:promote -- --attestations data/capture-attestations.json`. This probes dimensions, frame rate, duration, bytes, hashes, and rejected-V2 reuse before atomically updating the capture lock.
3. Generate narration locally with `npm run voice:generate`. This invokes cached Kokoro only, synthesizes all eight locked lines, builds a 90-second master, records exact hashes, and makes zero metered TTS provider calls. Do not run another ElevenLabs preflight or synthesis request.
4. The local generator maps all 183 supplied words monotonically inside their exact scene windows and records the source WAV hashes plus final-master loudness.
5. Run `npm run captions`, `npm run check:source`, and `npm run gate:render`. Captions use block spans, carry `data-layout-allow-caption-zone`, and contain neither `<br>` nor `translateX`.
6. After the strict gate passes, run the enhanced HyperFrames check and visually inspect snapshots. Render only after approval. `npm run render:final` performs the 4K60 render, two-pass loudness master, and the final technical/transcript gate.

`npm run runtime:check` resolves project-local FFmpeg/FFprobe binaries first and reports exact versions; runtime scripts do not assume global PATH installation.

## Required truth labels

- `MCP · TOOL CONNECTION`
- `HARD STOP · NO SIGNATURE · NO SUBMIT · NO MONEY MOVED`
- `EARLIER AUTHORIZED RUN · READ ONLY · NOT CREATED HERE`
- `KEEPERHUB · EXECUTION SERVICE`
- `BASE SEPOLIA · PUBLIC TEST NETWORK`
