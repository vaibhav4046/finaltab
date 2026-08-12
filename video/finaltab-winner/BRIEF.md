# BRIEF — FINALTab V3 judge film

## Deliverable

An exact 90.000-second, native 3840×2160, 60 fps product film. It opens on the text-only FINALTab wordmark, explains the product in plain English, shows the real signed-in product, proves a difficult voice-and-agent run, performs a real authenticated MCP tool-connection test that stops before any wallet action, and closes on independently checkable proof.

## Audience and message

Hackathon judges should leave with one sentence: FINALTab turns a shared receipt into an exact plan that people approve, executes an authorized test-network settlement once, and leaves proof anyone can inspect.

## Locked scene order

| Scene | Window | Job |
| --- | --- | --- |
| 01 | 00:00–00:04 | Text-only FINALTab logo animation |
| 02 | 00:04–00:12 | What the product does |
| 03 | 00:12–00:20 | Real use cases |
| 04 | 00:20–00:30 | Simple architecture in plain English |
| 05 | 00:30–00:50 | Real final-site demonstration |
| 06 | 00:50–01:08 | Real complex voice, model, four-review, and memory-graph task |
| 07 | 01:08–01:25 | Authenticated MCP non-broadcast test and hard stop |
| 08 | 01:25–01:30 | Earlier-run proof and CTA |

The windows are contiguous and total exactly 90.000 seconds.

## Truth boundaries

- No fake product UI, terminal output, participant identity, model response, review event, memory record, tool result, or proof state.
- Receipt names are never inferred. People shown in the product are entered by the user or safely redacted.
- The filmed MCP session may authenticate, list tools, allocate the receipt, prepare a wallet request, and create an approval challenge. It must stop there.
- The filmed MCP session never requests a wallet signature and never calls a submit, sign, broadcast, or value-moving operation.
- The settled transaction shown at the end is an earlier authorized run. It is visibly separate from the filmed MCP test.
- KeeperHub is introduced as the execution service. Base Sepolia is introduced as the public test network. MCP is introduced as a tool connection.

## Visual system

One product and one film brand: carbon-black surfaces, electric blue for activity, acid green for product signal, and verified green only for checked proof. FINALTab and all headlines use Geist Sans. Evidence uses Geist Mono. No serif face is part of V3.

## Narration and audio

- Locked script: 183 words.
- Voice: George, British male (`bm_george`), synthesized locally with Kokoro-82M.
- Model: `kokoro-v1.0` from the local offline cache.
- Generation: one complete local build for all eight locked scenes; zero metered TTS provider calls and no reused narration assets.
- Current state: the local narration master, timing map, and captions are approved. The earlier ElevenLabs quota check was denied, consumed its single allowed subscription GET, made zero synthesis POSTs, and must not be retried.
- Final mix: integrated loudness −14.0 LUFS, true peak no higher than −1.0 dBTP, no background music, and restrained local SFX below the voice.

## Release condition

Source validation may pass with explicit placeholders. Final rendering stays blocked until all four V3 captures, the approved local narration package, alignment, captions, eight newly built scene compositions, capture hashes, and final audio checks pass. The rendered 4K60 MP4 must be exactly 90.000 seconds within one video frame.
