---
name: FINALTab Carbon V3
canvas:
  width: 3840
  height: 2160
  fps: 60
  duration_seconds: 90
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
  carbon: "#050706"
  paper: "#F4F8F1"
  active: "#45AFFF"
  signal: "#C8FF3D"
  verified: "#B8FF5C"
  metadata: "#B7C0B8"
  failure: "#FF7B74"
typography:
  brand:
    family: Geist Sans
    source: assets/fonts/Geist-Variable.woff2
    weight_range: [600, 800]
    size_range: [72, 220]
  body:
    family: Geist Sans
    source: assets/fonts/Geist-Variable.woff2
    weight_range: [450, 700]
    size_range: [32, 72]
  evidence:
    family: Geist Mono
    source_regular: assets/fonts/GeistMono-Regular.woff2
    source_bold: assets/fonts/GeistMono-Bold.woff2
    size_range: [32, 92]
motion:
  entrance_seconds: [0.35, 0.7]
  entrance_eases: [power3.out, expo.out, sine.out]
  scene_handoff_seconds: [0.35, 0.45]
  proof_green_rule: "Only independently checked proof may use #B8FF5C."
components:
  evidence_panel: "2px metadata rule, 18px radius, carbon surface, Geist Mono labels"
  transition_edge: "carbon-to-electric-blue-to-acid handoff with one acid signal edge"
  capture_slot: "neutral dashed plate that names the exact real capture still pending"
  proof_stamp: "verified outline shown only on the earlier checked run"
constraints:
  - "No fake product UI, terminal, chat transcript, memory node, tool result, or optimistic success."
  - "No serif font or second brand face."
  - "Important proof identifiers never render below 40px at 4K."
  - "The composition and final master are native 3840x2160 at 60 fps for exactly 90.000 seconds."
  - "Acid green is product signal; verified green is proof-only."
  - "No glassmorphism, gradient text, infinite animation, or bouncing motion."
  - "Scenes 1-7 use only the root transition as their exit."
---

# FINALTab Carbon V3

The live product and the film share one visual voice. Geist Sans explains; Geist Mono proves. Carbon holds the frame, electric blue shows work, acid green carries the FINALTab signal, and verified green appears only after an earlier public result has been checked.
