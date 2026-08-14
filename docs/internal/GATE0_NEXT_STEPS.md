# Next steps — canonical handoff

This file previously duplicated an August 10 release snapshot. It is retained
only as a stable entry point; do not use older revisions as submission truth.

Current state and remaining gates:

- [docs/release/status.md](../release/status.md)
- [docs/release/SUBMISSION_CHECKLIST.md](../release/SUBMISSION_CHECKLIST.md)
- [docs/submission.md](../submission.md)
- [docs/release/user-actions.md](../release/user-actions.md)

## What is proven (updated 2026-08-14)

The external-wallet V2 USDC settlement and the video render are both done. They
are no longer blockers.

- **Settlement — proven.** KeeperHub execution `3hmlqi36zweiwg6fc5o2u`,
  transaction
  `0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789`,
  block `45327128`, 1 USDC atomic unit, debtor `-1` / creditor `+1` /
  contract retained `0`. Source:
  [../release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json](../release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json).
- **Video master — published and verified.** <https://youtu.be/eXZACnOdt5w>,
  90.005 s, 3840×2160 at 60 fps, 5,400 H.264 frames with AAC audio,
  35,617,576 bytes, sha256
  `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69`. The live
  page was loaded on 2026-08-14: title "FINALtab Product for KeeperHub - Agents
  Onchain Hackathon", player duration 90.021 s, visibility **Unlisted** — the
  link resolves for anyone holding it but the video is not listed publicly.
  See [../demo-storyboard.md](../demo-storyboard.md).

  The gitignored `proof-output/finaltab-demo.mp4` is a different file
  (101.64 s, 1080p25, sha256 `de8aa301…`) and is not the published master.

## What is still outstanding

- **Human submission on DoraHacks.** This is a human-only action; see
  [../release/user-actions.md](../release/user-actions.md).

## Deadline — read this before trusting any date in these documents

The submission window recorded across the canonical documents
([../release/status.md](../release/status.md),
[../release/SUBMISSION_CHECKLIST.md](../release/SUBMISSION_CHECKLIST.md),
[../submission.md](../submission.md)) is **2026-08-13 12:00 UTC+2**
(10:00 UTC / 11:00 BST). **As of 2026-08-14 that time has passed.** Treat every
"submit before the deadline" instruction in this repository as historical.

The submission itself is recorded as already made:
[../release/SUBMISSION_CHECKLIST.md](../release/SUBMISSION_CHECKLIST.md) marks
BUIDL 47656 submitted and `Under Review`, observed on the live page on
2026-08-11 — two days inside the window. That status line is **not
re-verifiable logged out**: the public BUIDL page at `dorahacks.io/buidl/47656`
renders the full FINALTab entry (description, KeeperHub integration writeup,
the nine MCP tools, execution `3hmlqi36zweiwg6fc5o2u`, and the CLI PR link) but
exposes no submission-status or hackathon-association field in the page or its
payload. Re-check it signed in before relying on it.

The canonical documents also record ten finalists pitching **August 17–19**,
which is ahead of 2026-08-14. If FINALTab is selected, the public video URL
becomes a live requirement rather than a checklist item.

The live form was verified on 2026-08-11. The historical V1 files are not
submission artifacts.
