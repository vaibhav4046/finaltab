# FINALTab winner film — visual identity

## Style prompt

**Ledger Noir**: the warmth of a late-night restaurant receipt meets the exactness of an institutional settlement ledger. Frames feel printed, tactile, and cinematic—not like a generic neon SaaS dashboard. Large editorial statements establish the human problem; disciplined monospaced evidence proves the machine result. Negative space is deliberate, while animated rules, receipt edges, signatures, and transaction paths keep every scene alive. The emotional arc moves from messy social debt to calm, independently verified closure.

## Colors

- `#0B0F12` — night canvas; persistent background
- `#F4EEE2` — receipt paper and primary statement text
- `#FF936A` — human action, scan, and approval accent
- `#B7F5D8` — verified proof only; never decorative
- `#91A0A8` — secondary metadata and grid rules

No additional semantic colors are introduced. Failures use the product’s existing `#FF7B74` only when a real failed state is shown.

## Typography

- **Fraunces SemiBold** — editorial statements and logo moments, 72–150 px, tight tracking
- **Geist Mono Regular/Bold** — evidence, addresses, amounts, tool calls, captions, and labels, 20–58 px with tabular numerals

The serif voice is human and material; the mono voice is cryptographic and auditable. Never pair two display faces in one scene.

## Motion

- Deliberate premium entrances: 0.35–0.75 s, usually `expo.out`, `power3.out`, or `sine.out`
- Primary scene handoff: editorial push/focus-pull, 0.35–0.5 s
- Topic-change accent: receipt-edge wipe or restrained circle iris, 0.45–0.6 s
- Proof climax: fast verified stamp plus one overexposure pulse; green appears only after the independently checked receipt lands
- Every scene follows build → breathe → resolve, with no exit animation before its transition
- Ambient motion is sparse: one slow paper drift, graph path draw, or scan line per scene; no infinite repeats

## Layout

- 1920×1080 landscape, 60 fps final render
- 96 px outer safety margin; captions remain inside the bottom 120 px safe zone
- Two focal points and at least three visual layers per scene
- Product footage is framed as evidence, not decoration: legible at hero moments, with precise callouts rather than fake cursor theatrics
- Addresses and numbers use tabular figures and never shrink below 20 px

## What not to do

- No purple/cyan neon, glassmorphism, gradient text, floating identical cards, or generic AI-dashboard visuals
- No decorative verified green; green always means a checked onchain fact
- No jump cuts, frantic zoom spam, fake terminal typing, optimistic success, or prewritten proof
- No tiny web UI pasted full-frame without guided focus
- No unsupported claims such as “production mainnet,” “minimum transfers,” or “trustless” without the exact qualifying evidence on screen
