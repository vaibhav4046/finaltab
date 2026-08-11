---
name: Ledger Noir
canvas:
  width: 3840
  height: 2160
  fps: 60
  background: "#050706"
delivery:
  width: 3840
  height: 2160
  resolution_preset: landscape-4k
  scale_from_canvas: 1
safe_area:
  outer: 192
  caption_bottom: 60
  caption_height: 232
colors:
  night: "#050706"
  paper: "#F4F8F1"
  action: "#45AFFF"
  signal: "#C8FF3D"
  verified: "#B8FF5C"
  metadata: "#B7C0B8"
  failure: "#FF7B74"
typography:
  editorial:
    family: Fraunces
    source: assets/fonts/Fraunces-Variable.ttf
    weight: 600
    size_range: [144, 300]
  evidence:
    family: Geist Mono
    source_regular: assets/fonts/GeistMono-Regular.woff2
    source_bold: assets/fonts/GeistMono-Bold.woff2
    size_range: [40, 116]
motion:
  entrance_seconds: [0.35, 0.75]
  entrance_eases: [expo.out, power3.out, sine.out]
  scene_handoff_seconds: [0.35, 0.5]
  proof_green_rule: "Only independently checked onchain facts may use #B8FF5C."
components:
  evidence_panel: "1px metadata rule, 18px radius, night surface, mono labels"
  transition_edge: "carbon-to-electric-blue-to-acid handoff with an acid signal edge"
  capture_slot: "neutral dashed plate that explicitly says footage is pending"
  proof_stamp: "verified outline, appears only after both witnesses agree"
constraints:
  - "No fake product UI, terminal, chat transcript, or optimistic result."
  - "Addresses and proof identifiers never render below 40px."
  - "The composition root and final master are native 3840x2160 at 60 fps."
  - "Acid green is limited to brand signal and handoff; verified green is proof-only."
  - "No glassmorphism, gradient text, or infinite animation."
  - "Frames 1-8 have no authored exit animation."
---

# Ledger Noir

Carbon-black surfaces meet cryptographic precision. Electric blue marks motion in progress; acid green marks product signal and handoff; verified green is reserved for independently checked proof. Fraunces carries the human promise; Geist Mono carries every claim that a judge can verify.
