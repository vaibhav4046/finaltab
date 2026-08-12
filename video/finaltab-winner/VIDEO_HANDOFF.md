# VIDEO HANDOFF — FINALTab V3 judge film

## Frozen source

- Exact runtime: 90.000 seconds / 5,400 frames at 60 fps.
- Exact scene windows: `0–4`, `4–12`, `12–20`, `20–30`, `30–50`, `50–68`, `68–85`, `85–90`.
- Locked narration: 188 plain-English words across eight lines.
- Brand: Geist Sans headlines and wordmark; Geist Mono evidence; carbon / acid / electric blue; verified green for checked proof only.
- Audio requirement: one entirely new ElevenLabs George / `eleven_multilingual_v2` complete-script batch; no old scene reuse; final mix −14.0 LUFS integrated and ≤ −1.0 dBTP.
- Safety: the MCP capture stops after approval-challenge creation. No wallet signature, submit, broadcast, or value movement. Earlier-run proof is separate and read only.

## Intentionally pending

1. Four V3 canonical captures: C05–C08.
2. One new complete-script ElevenLabs batch and offline alignment.
3. SRT, VTT, cue JSON, and baked captions from that alignment.
4. Eight newly built V3 scene compositions and the final 90-second index.
5. V3 capture/audio hash promotion.
6. HyperFrames enhanced check, contact-sheet inspection, render, two-pass loudness master, and rendered-master verification.

No provider request, live capture, wallet action, MCP mutation, or render was performed by the V3 source rebuild.

## Gate semantics

```powershell
npm run check:source
```

Validates the exact schedule, script, terminology, design tokens, pending-safe manifests, capture contracts, SFX bytes, and render command without pretending missing assets exist. It prints a source-pass message plus the explicit pending list.

```powershell
npm run gate:render
```

Strict mode. It must fail until captures, one-batch voice evidence, alignment, captions, eight new frames, the final index, and hash locks are complete.

```powershell
npm run render:final
```

Later, after the strict gate passes, renders the raw 4K60 composition, masters the complete program to −14.0 LUFS, and checks resolution, fps, runtime, integrated loudness, and true peak. Do not run it while any prerequisite is pending.

## Guarded execution order

These tools do not navigate a browser or perform MCP/wallet/value actions. The capture tool only validates and promotes already-created local files.

1. Create a review worksheet with `npm run capture:init-review -- data/capture-attestations.json`. Watch all four local artifacts, change every exact assertion to `true`, add reviewer/time, and set the worksheet status to `approved-human-review`.
2. Promote only after review: `npm run capture:promote -- --attestations data/capture-attestations.json`. This probes dimensions, frame rate, duration, bytes, hashes, and rejected-V2 reuse before atomically updating the capture lock.
3. Validate narration without a provider call: `npm run voice:generate`. Direct local synthesis is retired. After the draft migration/route and the two-capability operator setup are separately approved and deployed, run `npm run voice:runtime:preflight`, then `npm run voice:runtime:generate`. The runner requires the existing scoped bearer plus the dedicated ignored narration capability described in `scripts/ELEVENLABS_QUOTA_PREFLIGHT.md`.
4. Produce word-level JSON for the raw response with offline faster-whisper. Then run `python scripts/align-narration.py --execute --transcript <word-json>`. The helper requires raw ASR WER ≤15%, deterministically maps all 188 locked words to a complete monotonic timing sequence, and permits only a bounded per-scene `atempo` factor from 1.00 through 1.12 before building the 90-second master without a provider call.
5. Run `npm run captions`, `npm run check:source`, and `npm run gate:render`. Captions use block spans, carry `data-layout-allow-caption-zone`, and contain neither `<br>` nor `translateX`.
6. After the strict gate passes, run the enhanced HyperFrames check and visually inspect snapshots. Render only after approval. `npm run render:final` performs the 4K60 render, two-pass loudness master, and the final technical/transcript gate.

`npm run runtime:check` resolves project-local FFmpeg/FFprobe binaries first and reports exact versions; runtime scripts do not assume global PATH installation.

## Required truth labels

- `MCP · TOOL CONNECTION`
- `HARD STOP · NO SIGNATURE · NO SUBMIT · NO MONEY MOVED`
- `EARLIER AUTHORIZED RUN · READ ONLY · NOT CREATED HERE`
- `KEEPERHUB · EXECUTION SERVICE`
- `BASE SEPOLIA · PUBLIC TEST NETWORK`
