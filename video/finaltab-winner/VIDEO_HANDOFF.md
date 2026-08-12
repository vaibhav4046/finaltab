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

## Required truth labels

- `MCP · TOOL CONNECTION`
- `HARD STOP · NO SIGNATURE · NO SUBMIT · NO MONEY MOVED`
- `EARLIER AUTHORIZED RUN · READ ONLY · NOT CREATED HERE`
- `KEEPERHUB · EXECUTION SERVICE`
- `BASE SEPOLIA · PUBLIC TEST NETWORK`
