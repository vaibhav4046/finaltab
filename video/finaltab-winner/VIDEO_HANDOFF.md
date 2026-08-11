# VIDEO HANDOFF — FINALTab winner film

## Current state

The source is hardened for HyperFrames 0.7.106, but final rendering is deliberately blocked.

Completed:

- Frame 8 is an authenticated non-broadcast MCP sequence with a hard stop and separate retained read-only proof.
- Unsupported participant-invitation and fresh approval chronology are removed.
- The retained transaction is labelled as separate from the filmed MCP client.
- Capture contracts and a pending capture-hash lock exist.
- SFX are local, licensed, hash-locked, and cued; BGM is disabled.
- VTT exists beside SRT and cue JSON.
- Selective narration and caption-sync scripts enforce changed scenes only.
- One root motion sidecar and narrow layout annotations cover the enhanced 0.7.106 audit.

Still required:

1. Production promotion/cutover must be complete.
2. Capture C03, C04, C05, C06A, C06B, C07, C08A, and C08B under `data/capture-contracts.json`.
3. Replace all capture slots and pending labels.
4. Approve `data/capture-lock.json` with bytes and SHA-256 for all eight artifacts.
5. Set the four capture truth flags only after evidence exists.
6. Selectively regenerate ElevenLabs scenes 3, 4, 5, 6, and 8.
7. Rebuild captions and verify all hashes.
8. Run source, enhanced, and final gates.
9. Render only after the final gate passes.

## Safe capture boundary

Autonomous captures may use the canonical product, authenticated non-value-moving MCP tools, retained KeeperHub evidence, and public Base Sepolia proof. The only expected user contingency is GitHub MFA or first-time consent. Do not request wallet action, call a settlement submission tool, or move value.

## Narration reuse decision

Current scene files are checksum-valid. Reuse scenes 1, 2, 7, and 9 unchanged. Scenes 3, 4, 5, 6, and 8 contain retired wording and are timing references only until selectively regenerated.

After canonical captures are approved:

```powershell
npm run voice
npm run captions
```

The first command regenerates exactly scenes 3, 4, 5, 6, and 8 and copies their alignment into the project. The second builds synchronized SRT, VTT, cue JSON, baked captions, voice durations, and hashes.

## Verification

```powershell
npm run check:source
npm run check:enhanced
node verify-video-gates.mjs
```

Expected now: the source gate passes and reports the remaining capture, truth, lock, narration, and caption blockers. Expected before render: `FINAL RENDER GATE PASSED`.

## Final render

```powershell
npm run render:final
```

This is native 3840×2160 at 60 fps, PNG video frames, strict-all, no best-effort, low-memory mode, and no frame cache. Do not run it before canonical captures are supplied and all gates pass.
