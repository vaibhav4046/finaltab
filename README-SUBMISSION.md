# FINALTab — submission entrypoint

This file intentionally contains no duplicate submission copy. Duplicated
claims previously drifted across several documents, including conflicting
92.7-second and 101.64-second video metadata.

- Canonical submission copy: [docs/submission.md](docs/submission.md)
- Source-of-truth status: [docs/release/status.md](docs/release/status.md)
- Submission record and remaining gates:
  [docs/release/SUBMISSION_CHECKLIST.md](docs/release/SUBMISSION_CHECKLIST.md)
- Evidence labels: [docs/release/truth-snapshot.md](docs/release/truth-snapshot.md)

Current state: [DoraHacks BUIDL 47656](https://dorahacks.io/buidl/47656) is
submitted and `Under Review`; the Best Onboarding UX Improvement bounty
application is saved. Canonical deployment
`dpl_F5PgMqo7A9zecQW2LKos2FcCNVMs` serves commit
`039582fc44901d1f436b61a426f1523a936427f9` and is `READY`. The verified public
film is <https://youtu.be/eXZACnOdt5w>: 90.005s, 3840×2160/60 fps, 5,400 H.264
frames with AAC audio, 35,617,576 bytes, SHA-256
`a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69`.
Narration was generated locally with Kokoro; ElevenLabs received one denied
quota-check GET and zero synthesis POSTs, with no retry. The production browser
voice lifecycle remains unproven. The filmed MCP flow performed no signing,
submission, broadcast, or value movement, and the separately retained
settlement must not be relabeled as that run. KeeperHub CLI
[PR #95](https://github.com/KeeperHub/cli/pull/95) is open and unmerged and adds
only `--require-verified`.
