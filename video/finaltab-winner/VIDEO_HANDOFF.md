# VIDEO HANDOFF — FINALTab winner film

## Current state

The source is hardened for HyperFrames 0.7.106. Hybrid narration, captions, the source gate, and the strict final provenance gate are synchronized and passing; final rendering has not started.

Completed:

- Frame 8 is an authenticated non-broadcast MCP sequence with a hard stop and separate retained read-only proof.
- Unsupported participant-invitation and fresh approval chronology are removed.
- The retained transaction is labelled as separate from the filmed MCP client.
- All eight canonical captures are installed, their truth flags are set, and `data/capture-lock.json` contains the approved byte/hash lock.
- SFX are local, licensed, hash-locked, and cued; BGM is disabled.
- VTT exists beside SRT and cue JSON.
- The direct provider-key narration generator is retired. The remaining voice commands only validate and synchronize local assets; neither command can make a provider request.
- The hybrid narration synchronizer validates retained Multilingual v2 provenance; the sanitized Flash v2.5 release-call ledger; the immutable deployment, shared provider-helper source, exact call/scene set, and MP3 byte/hash identity; frame budgets; alignment quality; and capture-lock identity.
- All five changed-scene alignments pass their transcript-constrained quality gates, and SRT, VTT, cue JSON, baked caption HTML, voice durations, proof assets, and manifests are synchronized.
- One root motion sidecar and narrow layout annotations cover the enhanced 0.7.106 audit.

Remaining release steps:

1. Run the enhanced HyperFrames audit and inspect the pre-render contact sheet.
2. Commit the exact checked source package.
3. Render only if the enhanced audit remains clean and the final gate still passes.

## Safe capture boundary

Autonomous captures may use the canonical product, authenticated non-value-moving MCP tools, retained KeeperHub evidence, and public Base Sepolia proof. The only expected user contingency is GitHub MFA or first-time consent. Do not request wallet action, call a settlement submission tool, or move value.

## Narration reuse decision

Reuse scenes 1, 2, 7, and 9 byte-for-byte from the approved retained ElevenLabs Multilingual v2 package, including their provider-native timing. Scenes 3, 4, 5, 6, and 8 are the selected ElevenLabs Flash v2.5 responses generated with one call per selected exact text across three protected, expiring, fixed-scene Vercel release candidates. Four earlier attempts exceeded their scene budgets and are preserved as superseded evidence, for nine provider calls total. The canonical product alias `finaltab.vercel.app` was never promoted to those candidates; Vercel project aliases are not product release claims. Every endpoint called `apps/web/lib/server/voice.ts`, returned audio only, and provided no native timing; the local helper creates timing without claiming provider-native alignment. The sanitized `data/narration-generation-ledger.json` contains no credential and is the deployment/byte/hash authority for the five selected MP3s and the call-accounting authority for the four superseded attempts.

The completed, provider-free synchronization sequence is:

```powershell
npm run voice:check
npm run voice:sync
npm run captions
```

`voice:check` is a read-only local validation. It binds the sanitized generation ledger to the three immutable deployment IDs, provider-helper contract, model, George voice ID, selected scene set, five MP3 byte/SHA identities, and nine-call accounting. `voice:sync` preserves the validated retained Multilingual v2 manifest under the immutable `retained-multilingual-v2-manifest.json` name, mirrors and SHA-verifies all five changed MP3/alignment pairs into proof output, restores the four retained alignment files, and atomically writes the mixed-provenance manifest. Neither command reads a provider key, performs a network request, or generates audio. `captions` then atomically builds synchronized SRT, VTT, cue JSON, baked captions, voice durations, and hashes; the local approved manifest is its final commit marker, so an earlier failure remains safely rerunnable.

`npm run voice` no longer exists. `generate-voiceover.mjs` is a fail-closed retirement guard and cannot contact a provider.

## Verification

```powershell
npm run check:source
npm run check:enhanced
node verify-video-gates.mjs
```

Current verified result: the source gate reports synchronized prerequisites and the final gate prints `FINAL RENDER GATE PASSED`.

## Final render

```powershell
npm run render:final
```

This is native 3840×2160 at 60 fps, PNG video frames, strict-all, no best-effort, low-memory mode, and no frame cache. Do not run it before canonical captures are supplied and all gates pass.
