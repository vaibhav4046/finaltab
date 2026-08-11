# FINALTab HyperFrames composition plan

**Phase:** source composition complete and statically verified. Agent/Privy/deployment probes, final real captures, regenerated audio, and render remain gated.
**Timeline lock:** 96.0 seconds on a native 3840×2160 composition at 60 fps = 5,760 output frames.
**Workflow:** `product-launch-video`, autonomous plan/build flow; rendering remains user-gated.

## Current project state

- `BRIEF.md`, `DESIGN.md`, `STORYBOARD.md`, `SCRIPT.md`, `CAPTIONS.srt`, `CAPTURE_MANIFEST.md`, and `EVIDENCE_MAP.md` are the preproduction source of truth.
- The scaffold's Figma cursor/logo assets and three Figma example compositions were unrelated example content and have been removed.
- `index.html` now assembles nine modular frame compositions, nine checksum-retained provisional ElevenLabs voice clips, provisional alignment-derived captions, and deterministic receipt-edge transition masks. The voice/caption package must be regenerated after approved captures.
- Current product truth: exactly nine production MCP tools; external-wallet dual signatures; first-party Freeze requires a current attested four-stage review; audit memory is bounded rather than self-evolving; Base Sepolia is the only chain adapter.
- `hyperframes.json`, `meta.json`, and the pinned project `package.json` remain for reproducibility.
- `frame.md` now locks the local Fraunces + Geist Mono Ledger Noir system. Direct HyperFrames lint/check pass; contact sheets are retained under `proof-output/finaltab-winner/`.

## Current file layout

```text
video/finaltab-winner/
  frame.md
  index.html
  audio_meta.json
  caption_groups.json
  data/
    release-proof.json
  audio/
    finaltab-george.wav
    finaltab-george-alignment.json
    bgm.wav
  assets/
    capture/
      C03-complex-product-flow.mp4
      C04-net-freeze-bind.mp4
      C05-dual-consent-simulate.mp4
      C06-v2-keeperhub-proof.mp4
      C06-v2-proof-capsule.png
      C07-developer-mcp-surface.png
      C08-real-mcp-v2-run.mp4
  compositions/
    frames/
      01-outcome-lockup.html
      02-architecture-rail.html
      03-complex-product-flow.html
      04-net-freeze-bind.html
      05-dual-consent-simulate.html
      06-keeperhub-proof.html
      07-nine-mcp-tools.html
      08-mcp-climax.html
      09-proof-cta.html
```

The capture files above are planned targets and do not exist yet. A build must fail clearly if a referenced capture, release field, or evidence gate is unresolved.

## Root timeline

| Frame | Composition ID | Start | Duration | End | Transition in | Primary source |
|---|---|---:|---:|---:|---|---|
| 01 | `finaltab-outcome-lockup` | 0.0 | 6.0 | 6.0 | cut | generated SVG/type |
| 02 | `finaltab-architecture-rail` | 6.0 | 10.0 | 16.0 | zoom-through | generated verified-data diagram |
| 03 | `finaltab-complex-product-flow` | 16.0 | 15.0 | 31.0 | crossfade | C03 real product capture |
| 04 | `finaltab-net-freeze-bind` | 31.0 | 13.0 | 44.0 | push-slide LEFT | C04 real product capture |
| 05 | `finaltab-dual-consent-simulate` | 44.0 | 12.0 | 56.0 | push-slide LEFT | C05 real wallet/simulation capture |
| 06 | `finaltab-keeperhub-proof` | 56.0 | 10.0 | 66.0 | zoom-through | C06 same-run proof capture |
| 07 | `finaltab-nine-mcp-tools` | 66.0 | 7.0 | 73.0 | zoom-through | live tools/list + C07 developer surface |
| 08 | `finaltab-mcp-climax` | 73.0 | 18.0 | 91.0 | crossfade | C08 real MCP run |
| 09 | `finaltab-proof-cta` | 91.0 | 5.0 | 96.0 | blur-crossfade | generated release-manifest end card |

Duration arithmetic: `6 + 10 + 15 + 13 + 12 + 10 + 7 + 18 + 5 = 96.0 seconds`. At 60 fps, the exclusive frame ranges are `[0,360)`, `[360,960)`, `[960,1860)`, `[1860,2640)`, `[2640,3360)`, `[3360,3960)`, `[3960,4380)`, `[4380,5460)`, `[5460,5760)`.

## Composition contract

- `index.html` is the standalone native 3840×2160 composition: `data-composition-id="finaltab-winner"`, `data-start="0"`, `data-duration="96"`, `data-width="3840"`, `data-height="2160"`, `data-fps="60"`. Final output must retain `--resolution landscape-4k --fps 60`.
- Each frame is a sub-composition in a `<template>` whose inner composition ID exactly matches the host and the `window.__timelines` key.
- Every timed host/clip carries `class="clip"`, `data-start`, `data-duration`, and a non-conflicting `data-track-index`.
- All full-bleed grounds live on full-duration child clips, never on a composition root. The assembled root paints the shared night canvas.
- Every frame registers exactly one paused, synchronous GSAP timeline. Use explicit `fromTo` states; no CSS keyframes/transitions, network calls, random values, wall-clock reads, infinite repeat/yoyo, or layout-property animation.
- Unique IDs are prefixed by frame ID across the assembled page.
- The framework owns all audio/video playback. Captured `<video>` elements are muted; narration, BGM, and SFX are separate audio clips.
- Frames 1–8 have no authored exit animation. The transition injector owns their exits. Frame 9 may settle but must not animate off.

## Track plan

| Track | Content | Rule |
|---:|---|---|
| 0 | shared night canvas / global paper grain | one finite full-duration ground; no looping noise |
| 10 | nine sequential frame hosts | adjacent windows only; transition injector may create controlled overlap |
| 20 | baked caption composition | bottom 17 percent only; driven by final word alignment |
| 30 | narration | one framework-owned audio clip from time 0 with retained internal silence |
| 31 | BGM | full cut, ducked under VO, short fade-in and longer fade-out |
| 32 | SFX | sparse clips keyed to storyboard events; proof stamp only after proof resolves |

Captured media and per-frame overlays stay inside their frame sub-composition; they do not consume global tracks.

## Release-proof data contract

`data/release-proof.json` is generated from the final sanitized run manifest. It must contain public verification material only:

```json
{
  "schemaVersion": 1,
  "network": "Base Sepolia",
  "chainId": 84532,
  "v2Contract": "0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB",
  "deployment": {
    "executionId": "xasakw5nfxkh2s0fh4stn",
    "transactionHash": "0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f",
    "blockNumber": 45321107,
    "sourcifyMatchId": "43497805",
    "label": "CONTRACT DEPLOYMENT · NOT A SETTLEMENT"
  },
  "settlement": {
    "runId": "{{REQUIRED}}",
    "executionId": "{{REQUIRED_DIFFERENT_FROM_DEPLOYMENT}}",
    "transactionHash": "{{REQUIRED_DIFFERENT_FROM_DEPLOYMENT}}",
    "blockNumber": "{{REQUIRED}}",
    "settlementId": "{{REQUIRED_BYTES32}}",
    "ledgerHash": "{{REQUIRED_BYTES32}}",
    "verdict": "VERIFIED_SETTLED"
  },
  "publicUrls": {
    "product": "https://finaltab.vercel.app",
    "github": "https://github.com/vaibhav4046/finaltab",
    "mcp": "https://finaltab.vercel.app/api/mcp",
    "keeperHubWorkflow": "https://finaltab.vercel.app/integrations/keeperhub/workflow",
    "transaction": "{{REQUIRED}}"
  }
}
```

Pre-build validation must reject:

- any `{{...}}`, `PENDING`, or `MISSING` value;
- a settlement execution/transaction equal to the deployment execution/transaction;
- a chain other than 84532;
- a V1 contract address or historical V1 identifier;
- a verdict other than `VERIFIED_SETTLED` for the proof-green variants;
- absent/invalid 32-byte `settlementId` or `ledgerHash`;
- mismatch between the release file and the trace/chain-proof manifest.

## Frame construction packets

### 01 — Outcome lockup

- Use the text-only FINALTab wordmark from the product surface. A seek-safe SVG
  receipt rule may animate beneath it, but there is no separate symbol logo.
- No screenshot, legacy mark, or generic Figma logo.
- Preserve the 0.8-second still hold at the end.

### 02 — Architecture rail

- Generated, data-driven stations only.
- The deployment evidence chip is cream/mono, not proof green, and always carries the deployment-only qualifier.
- The independent-proof station is a mechanism promise here, not a claim that a settlement has already happened.

### 03–05 — Product evidence sequence

- Use the real capture as the base plate; reconstruct only the one UI element that must animate independently or remain readable during a focus lock.
- Do not rebuild the entire product surface in HTML.
- All callouts must name visible state, not add unsupported state.
- Frame 3 may show the branded auth return, linked Privy identity, durable tab,
  or cross-device invite only after their respective production probes pass.
  Participant names and wallet addresses must be visibly user-entered, never
  inferred from a receipt that does not contain them.
- Frame 4 must show the four fixed review stages, honest pre-submission proof
  skip, stale-review invalidation after an edit, and a fresh attested run before
  Freeze binds the durable receipt UUID. Memory is labelled bounded audit memory.
- Frame 5 contains both a real passed simulation and a separately real revert capture; label them clearly so chronology cannot be misread.

### 06 — KeeperHub proof

- Hard gate on future `settlement` fields in `release-proof.json`.
- The verified stamp enters only after KeeperHub and independent proof panels visibly agree.
- The contract deployment IDs are banned from this composition.

### 07 — MCP tool map

- Build exactly nine production cells from live `tools/list`; any retired
  fixed-wallet name means the wrong deployment was captured and blocks render.
- Value-moving `submit_signed_settlement` uses the human-action accent, not proof green.

### 08 — MCP climax

- Real capture is the base plate. Use focus crops and public trace overlays to keep every stage legible.
- The status input is text-locked exactly as `settlement_status({ executionId, settlementId, ledgerHash })`.
- The human personal-sign moment must visibly pause the agent chronology.
- Any tool error stays in order; recovery is shown honestly rather than edited into a first-try fiction.
- Final proof IDs must equal Frame 6 and Frame 9.

### 09 — Proof CTA

- Generated from `release-proof.json`; no browser capture required.
- Public links must be readable but the frame remains a calm end card, not a wall of tiny URLs.
- Show a shortened transaction in frame and attach the full URL in the public description/submission package.

## Narration and caption synchronization

1. Generate all locked indented lines from `SCRIPT.md` through ElevenLabs George using the timestamp-returning endpoint. Never persist or print the API key.
2. Retain the provider's character/word alignment as `audio/finaltab-george-alignment.json`; retain the exact request model/voice/settings without credentials in `audio_meta.json`.
3. Preserve the 96-second frame windows. Fit each line inside its assigned guide window by adjusting designed silence and at most modest voice settings; do not time-stretch speech into an unnatural cadence.
4. Replace the draft cue timings in `CAPTIONS.srt` from the final alignment while preserving spoken text. Build `caption_groups.json` from the same alignment so baked and external captions cannot drift.
5. Caption groups are one or two lines, no more than roughly 42 characters per line, and never cover hashes, amounts, tool arguments, or the proof verdict.
6. Manually review the words `USDC`, `EIP-3009`, `KeeperHub`, `Base Sepolia`, `RPC`, `execution ID`, `settlement ID`, `ledger hash`, and `VERIFIED_SETTLED` for pronunciation and timing.

## Build and verification order

1. Apply/verify the ordered additive migrations and post-promotion cutover,
   configure/probe Privy, and close the final
   product/security/deployment gates outside this video project.
2. Complete C03–C08 captures and the same-run proof package in `CAPTURE_MANIFEST.md`.
3. Populate and validate `data/release-proof.json`; run a whole-repo secret scan before staging any capture.
4. Produce `frame.md` from the locked design system.
5. Generate narration/alignment and replace draft caption timings.
6. Build the nine frame sub-compositions from separate bounded frame packets, then assemble `index.html`.
7. Inject and verify transitions.
8. Run `hyperframes lint` and `hyperframes check`; stop on any error.
9. Snapshot every frame midpoint plus every cut at cut minus 0.1 seconds and cut plus 0.2 seconds. Inspect the contact sheet and all proof/hash/tool-call text at original resolution.
10. Open preview and ask the required user gate: preview changes or render.
11. Render only after approval with `--resolution landscape-4k --fps 60`; then
    measure duration, streams, 3840×2160 resolution, frame rate, byte size, and
    SHA-256 rather than copying expected metadata.

## Snapshot schedule

- Midpoints: `3.0, 11.0, 23.5, 37.5, 50.0, 61.0, 69.5, 82.0, 93.5` seconds.
- Cut checks: `5.9/6.2, 15.9/16.2, 30.9/31.2, 43.9/44.2, 55.9/56.2, 65.9/66.2, 72.9/73.2, 90.9/91.2` seconds.
- Proof-specific checks: `64.7` seconds before Frame 6's green stamp and `65.3` after; `89.8` before Frame 8's green stamp and `90.4` after.

## Final acceptance

The project is render-ready only when the 96-second timeline is intact, every capture/evidence gate passes, there are no unresolved placeholders, the MCP status call visibly has all three exact arguments, the three proof frames reconcile to one V2 evidence package, narration and baked/external captions have been regenerated against the approved captures from one final ElevenLabs alignment, `data/voiceover-manifest.json` is marked `approved-final-capture-sync`, all HyperFrames checks pass, snapshots are manually inspected, and the user explicitly approves the 3840×2160/60 master render.
