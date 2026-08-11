# BRIEF — FINALTab winner film

## Deliverable

A 96-second, native 3840×2160, 60 fps product film built and rendered with HyperFrames 0.7.106. The visual system is Ledger Noir aligned to the live product: carbon black, electric-blue transit boundaries, acid-green verified proof, and exact monospaced evidence.

## Audience and outcome

Hackathon judges should understand three things without trusting narration alone:

1. FINALTab turns an ambiguous shared receipt into an exact frozen settlement plan.
2. Human and agent paths use the same external-wallet safety boundary.
3. The retained Base Sepolia V2 settlement is publicly verifiable and is not presented as the output of the filmed MCP session.

## Story spine

- Human problem and architecture.
- Real signed-in product flow: scan, correct, add user-entered participants, allocate, reconcile.
- Four-stage current-input review, invalidation on edit, fresh rerun, freeze.
- Sanitized retained evidence for both debtor signatures and the successful pre-broadcast simulation.
- Retained KeeperHub receipt plus independent Base Sepolia proof.
- Exactly nine authenticated production MCP tools.
- Real MCP client runs only non-value-moving tools through approval-challenge creation, then stops.
- A separate read-only panel verifies the retained settlement.
- Public product, source, workflow, and transaction CTA.

## Truth boundaries

- No synthetic product UI, terminal output, client transcript, proof result, or participant identity.
- No second wallet signature, settlement submission, replay, or value move.
- The retained execution came from an explicitly authorized simulate-then-single-broadcast runner, not from MCP.
- Frame 8 may not imply that its client created the retained transaction.
- Participant names are entered by the user and never inferred from a receipt.
- Production captures must satisfy [data/capture-contracts.json](data/capture-contracts.json) and the final hash lock.

## Audio

- Voice: ElevenLabs George, with provenance scoped by scene rather than flattened into one model claim.
- Retained scenes 1, 2, 7, and 9 keep their approved `eleven_multilingual_v2` MP3s and provider-native timing.
- Changed scenes 3, 4, 5, 6, and 8 use selected `eleven_flash_v2_5` MP3s obtained with one call per selected exact text across three protected, expiring, fixed-scene Vercel release candidates. Four earlier attempts exceeded their scene budgets and are explicitly retained as superseded evidence, for nine provider calls total. The canonical product alias `finaltab.vercel.app` was never promoted to those candidates; Vercel's project aliases are not product release claims. Every endpoint called the shared `apps/web/lib/server/voice.ts` helper, returned audio only, used ElevenLabs defaults, and did not return timing alignment.
- `data/narration-generation-ledger.json` is the sanitized, credential-free call ledger. The source gate binds its three immutable deployment IDs, provider, model, George voice ID, exact selected scene set, byte counts, and SHA-256 values to the five local MP3s, while preserving the four over-budget attempts as non-selected records.
- Changed-scene timing is produced locally by the provider-free, transcript-constrained alignment helper and must pass its independent transcription quality gate.
- No command in this video project calls ElevenLabs. `npm run voice:check` validates the complete local package without writing; `npm run voice:sync` restores retained alignment files and writes the mixed-provenance manifest without making a network request.
- Build SRT, VTT, cue JSON, baked captions, and audio hashes only after the local mixed package validates.
- No music bed is approved in the current source.
- SFX are the documented local Pixabay-licensed files in `assets/audio/sfx`; no provider lookup was used.

## Release condition

The final render is intentionally blocked until all canonical captures, truth flags, capture hashes, hybrid narration provenance, caption hashes, enhanced HyperFrames checks, and source gates pass.
