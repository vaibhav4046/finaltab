# FINALTab winner film — source handoff

## Built and verified

- Master: `index.html`
- Timeline: 96.0 seconds on a native 3840×2160 composition at 60 fps
  (5,760 frames); final master target remains `landscape-4k`
- Scenes: nine modular sub-compositions under `compositions/frames/`
- Voice: nine checksum-retained **provisional script-pass** ElevenLabs MP3 clips under `assets/audio/voice/`
- Voice model: `eleven_multilingual_v2`; voice ID `JBFqnCBsd6RMkjVDRZzb` (George)
- Captions: 29 provisional baked cues derived from the retained ElevenLabs alignment cue sheet
- Public proof binding: `data/release-proof.json`
- Settlement: KeeperHub execution `3hmlqi36zweiwg6fc5o2u`; tx `0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789`; block `45327128`; exact one-atomic-unit transfer
- HyperFrames 0.7.105 lint: 0 errors, 0 warnings
- HyperFrames 0.7.105 check: pass; runtime 0, layout 0, motion 0, WCAG AA contrast 73/73
- Visual evidence: `proof-output/finaltab-winner/snapshots/` and `proof-output/finaltab-winner/proof-snapshots/`

The current voice, captions, and timing are review references only. The five
ordered additive migrations (`52236`, `60000`, `64822`, `73000`, `74000`) are
applied and schema-verified; that is not an application-flow probe. After
candidate promotion, the still-unapplied `74500` cutover, Privy configuration,
redesigned product, authentication, security/deployment probes, and real captures are approved, regenerate
ElevenLabs narration, alignment, baked captions, external captions, and scene
timing before the final 4K contact-sheet review. No final render was produced.

## Truthful capture blockers

The source deliberately uses obvious capture plates. They are not reconstructed product UI and not synthetic MCP output.

1. `assets/capture/C03-complex-product-flow.mp4`
2. `assets/capture/C04-net-freeze-bind.mp4`
3. `assets/capture/C05-dual-consent-simulate.mp4`
4. `assets/capture/C06-v2-keeperhub-proof.mp4`
5. `assets/capture/C06-v2-proof-capsule.png`
6. `assets/capture/C07-developer-mcp-surface.png`
7. `assets/capture/C08-real-mcp-v2-run.mp4`

Final capture work must happen only after the final
product/auth/Privy/security deployment probes, post-promotion cutover checks,
and public-link checks. A live
authenticated list must contain exactly nine production tools. C08 must be a
real named MCP client with the human approval pause and the exact call
`settlement_status({ executionId, settlementId, ledgerHash })`; the retained
one-atomic-unit runner may not be relabelled as an MCP broadcast. Codex CLI must
never be labeled “ChatGPT CLI.” Once the approved captures are locked,
regenerate the voice/caption package and mark `data/voiceover-manifest.json` as
`approved-final-capture-sync`; the current provisional checksum set must not
ship.

## Gates and commands

Source-safe gate (expected to pass with placeholders):

```powershell
node verify-video-gates.mjs --allow-placeholders
```

Final gate (currently expected to fail closed):

```powershell
node verify-video-gates.mjs
```

After all captures replace the slots, the three truth flags in `data/release-proof.json` are true, and regenerated narration/captions are approved against those captures, run from `video/finaltab-winner`:

```powershell
npm run check
node verify-video-gates.mjs
npm run render:final
```

Rendering still requires explicit approval after the final 3840×2160 capture
contact sheet is reviewed. After render, verify the file is actually 3840×2160
at 60 fps and record duration, codecs, bytes, and SHA-256.
