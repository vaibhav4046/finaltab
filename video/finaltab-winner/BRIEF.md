---
workflow: product-launch-video
flow: automation
storyboard: no
message: "FINALTab turns a messy shared bill into consent-bound, KeeperHub-executed, independently verified onchain settlement—and gives agents the same safe path through MCP."
destination: youtube
aspect: 1920x1080
language: en
audience: "KeeperHub hackathon judges, agent builders, and bounty reviewers"
length: 96s
angle: proof-first product reveal
narration: yes
voice: "ElevenLabs George — warm, precise, restrained"
vo_mode: restructured
---

## Intent

This is both a premium launch film and a judge-verifiable product walkthrough. Sell the human outcome first—one shared bill becomes one calm, auditable settlement—then show the real product, V2 consent design, KeeperHub execution, independent receipt verification, and an MCP agent completing the same flow. The pace should feel confident and fast, never breathless or slow.

## Assets

- `https://finaltab.vercel.app` — capture the rebuilt product’s real landing, settlement room, proof capsule, developer surface, and MCP configuration after V2 ships.
- `contracts/contracts/FinalTabBatchSettlementV2.sol` — source for the plan-binding architecture beat.
- `docs/release/evidence/` — sanitized KeeperHub execution, transaction, block, and independent RPC evidence generated after the V2 deployment.
- `docs/release/MCP_TRACE_SPEC.md` — source of truth for the final visible MCP call sequence.
- `capture/recordings/` — new 1920×1080 product and MCP recordings; no legacy V1 footage is treated as current proof.

## Customizations

- Open with a receipt-edge FINALTab logo animation.
- Explain the architecture visually: receipt → deterministic ledger → per-debtor USDC pull plus full-plan consent → KeeperHub → independent RPC proof.
- Show a genuinely complex bill: corrected extraction, multiple participants, cent-perfect allocation, graph netting, distributed approvals, simulate-first execution, and current proof capsule.
- Make MCP the closing hero: list tools, prepare, show the explicit approval boundary, submit externally signed V2 payload, poll to `VERIFIED_SETTLED`, then show balance delta and explorer proof.
- Use baked, word-timed captions plus a separate SRT/VTT deliverable; ElevenLabs narration must be synchronized to the actual edit.
- Render 1920×1080 at 60 fps with H.264/AAC, then produce a smaller upload copy without changing content.
- Use HyperFrames as the reproducible source and Supademo only where a guided interaction capture materially improves legibility.

## Notes

- Autonomous build: the user asked the agent to continue while they sleep and deliver the strongest truthful submission.
- The old V1 contract failed adversarial review and must never appear as the current production rail. Every live claim and proof in this film must be V2-specific.
- No fake typing, optimistic green states, server-hot-key flow presented as production, or unsupported “mainnet/production-ready/trustless” language.
- Verified green appears only after both KeeperHub’s terminal receipt and the independent Base Sepolia RPC check pass.
- Keep the final call to action practical: live product, GitHub, MCP endpoint, transaction proof, and KeeperHub integration package.
