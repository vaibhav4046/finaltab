# Design direction — Obsidian Ledger

The visual system FINALTab actually ships, with the reasoning behind it. Token values below are read
from [`apps/web/app/globals.css`](../../apps/web/app/globals.css), not aspirational.

## The direction, in one sentence

A warm graphite darkroom with a single real receipt lying in it — the app is the dark surface, the
ledger is warm ivory paper, and acid lime appears only where something is actionable or verified.

## Why this and not the default

The obvious build for a crypto settlement app is a cool blue-black dashboard with a purple gradient,
uniform cards, and a neon glow on everything. That look says "generic web3 product" and it says
nothing about splitting a dinner bill. Two problems with it here:

1. **It has no object.** A bill split has a physical referent — a receipt. A grid of equal cards
   throws that away.
2. **If everything glows, nothing signals.** In an app whose central honesty claim is *this state is
   verified and that one is not*, a palette that highlights uniformly destroys the one distinction
   that matters most.

So: warm, not cool. One paper object, not a card grid. Accent colour rationed hard.

## Palette

Warm greys throughout — every neutral is pulled toward yellow-brown, never toward blue.

| Role | Token | Value |
|---|---|---|
| Canvas | `--color-canvas` | `#121110` — near-black, warm |
| Surfaces | `--color-surface-1` / `-2` | `#191714` / `#201d19` |
| Edges | `--color-quiet` | `#2c2822` |
| Receipt paper | `--color-paper` | `#f4eddc` — ivory, not white |
| Ink on paper | `--color-ink` | `#1a1712` |
| Body text | `--color-txt` | `#ece8de` |
| Muted / faint | `--color-muted` / `--color-faint` | `#a49d8f` / `#6e6759` |

**Semantic, not decorative.** Four status colours, each with exactly one job:

| Token | Value | Means |
|---|---|---|
| `--color-signal` | `#c8f542` acid lime | actionable, or **verified** |
| `--color-danger` | `#ff6f61` coral | would revert, failed, rejected |
| `--color-warn` | `#f5c542` amber | blocked, degraded, needs attention |
| `--color-info` | `#5bd1e8` cyan | informational only |

Lime is the discipline. It is never used to make something look nice. If it's lime, you can press it
or the chain confirmed it. That is what makes the coral "WOULD REVERT — NOT BROADCAST" state read
instantly as *different in kind* from a success — the same reason [decisions.md](../release/decisions.md)
refuses to replay a cached receipt.

## Depth without decoration

`.receipt-paper` is the only element in the app with real material treatment:

```css
background:
  linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0) 18%),
  #f4eddc;
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.6),
  0 18px 40px -18px rgba(0,0,0,0.65);
```

A top-edge sheen and a long soft drop shadow, so the ledger sits *on* the canvas rather than being a
lighter rectangle painted onto it. Chrome around it stays flat. Depth is spent on the one object
that deserves it.

## Motion

Three durations, one easing curve:

```css
--duration-control: 140ms;   /* buttons, toggles — must feel instant */
--duration-ui:      220ms;   /* panels, reveals */
--duration-sheet:   300ms;   /* full sheets */
--ease-out-soft:    cubic-bezier(0.22, 1, 0.36, 1);
```

Fast out, gentle settle. Motion runs on `transform` and `opacity` only. Everything is disabled under
`@media (prefers-reduced-motion: reduce)`.

The state machine — freeze → sign → simulate → execute → verify — is where motion earns its place.
Transitions between rail states clarify that the flow moved forward. Nothing animates for atmosphere.

## Focus and selection

```css
:focus-visible { outline: 2px solid #c8f542; outline-offset: 2px; border-radius: 4px; }
::selection    { background: #c8f542; color: #1a1712; }
```

The signal colour is the focus ring. Keyboard navigation is a first-class path, not a retrofit, and
the accent that means "actionable" is the same accent that means "you are here".

## Typography

Geist Sans for interface, Geist Mono for anything that is a number, hash, address, or amount.

Monospace for money is not a style choice. Amounts stack in aligned columns so a reader can scan a
split for correctness, and hashes and addresses are legible character by character — which is the
entire point of showing a transaction hash to a judge.

## Against the checklist

Measured against the anti-template policy, the surface demonstrates:

- **Hierarchy through scale contrast** — one bright paper object against a dark, quiet field.
- **Depth and layering** — real material treatment on the receipt, flatness everywhere else.
- **Semantic colour** — four status colours with strictly one meaning each; lime rationed to
  actionable-or-verified.
- **Designed focus and selection states** — accent-coloured focus ring, offset, rounded.
- **Motion that clarifies flow** — tokenised, compositor-only, reduced-motion honoured.
- **Typography with a real pairing strategy** — mono reserved for values, sans for interface.

Deliberately absent: grain and film texture. Considered, then dropped. It would fight the paper
sheen, which is the one material effect the design already spends its depth budget on. There is no
noise overlay in the stylesheet, and this file does not claim one.
