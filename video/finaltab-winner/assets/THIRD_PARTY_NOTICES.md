# Third-party assets

- `fonts/Fraunces-Variable.ttf` is Fraunces from the Google Fonts repository, licensed under the SIL Open Font License 1.1. The license text is retained as `fonts/OFL-Fraunces.txt`.
- `fonts/Geist-Variable.woff2`, `fonts/GeistMono-Regular.woff2`, and `fonts/GeistMono-Bold.woff2` are copied from the repository's installed `geist` package for deterministic local rendering. The package license is retained as `fonts/OFL-Geist.txt`.
- `vendor/gsap-3.14.2.min.js` is the pinned GSAP 3.14.2 browser distribution used by HyperFrames.
- `audio/voice/scene-01.mp3`, `scene-02.mp3`, `scene-07.mp3`, and `scene-09.mp3` are the approved retained ElevenLabs Multilingual v2 narration package with provider-native timing.
- `audio/voice/scene-03.mp3`, `scene-04.mp3`, `scene-05.mp3`, `scene-06.mp3`, and `scene-08.mp3` are the selected project-owned ElevenLabs Flash v2.5 narration generated with one call per selected exact text across three protected, expiring, fixed-scene Vercel release candidates; the canonical product alias `finaltab.vercel.app` was never promoted to them. The credential-free `data/narration-generation-ledger.json` binds the five selected assets and records four non-selected over-budget attempts, for nine provider calls total. Caption timing is provider-free offline alignment, not provider-native timing.
- `audio/sfx/*.mp3` are copied from the HyperFrames `media-use` bundled local library and used under the Pixabay Content License. Exact files and license notes are retained in `audio/sfx/CREDITS.md` and `data/audio-manifest.json`.
