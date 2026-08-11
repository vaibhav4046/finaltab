# FINALTab submission — operational summary

Canonical copy: [docs/submission.md](docs/submission.md)
Operational truth: [docs/release/status.md](docs/release/status.md)
Final gate: [docs/release/SUBMISSION_CHECKLIST.md](docs/release/SUBMISSION_CHECKLIST.md)

## Current verdict

**Not ready to submit.** V2 deployment and exact source matching are proven.
The V2 USDC settlement, unified MCP trace, final video, public video URL, and
DoraHacks confirmation are pending.

The live DoraHacks project page was rechecked on 2026-08-11. The deadline is
2026-08-13 12:00 UTC+2 (10:00 UTC / 11:00 BST). The form requires a source
link, a short demo video showing the agent executing onchain through KeeperHub,
and a transaction link.

| Surface | State |
|---|---|
| Live app | <https://finaltab.vercel.app> — reverify after V2 configuration |
| Authenticated MCP | Source implements the external-wallet V2 flow; live post-deploy probe pending |
| V2 contract | [`0x7b58791c…cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| V2 deployment | execution `xasakw5nfxkh2s0fh4stn`; [tx `0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f); block `45321107` |
| Source verification | Sourcify exact match `43497805` |
| V2 settlement | **PENDING — no retained USDC settlement proof** |
| V2 video | **PENDING — no rendered file or public URL** |
| KeeperHub CLI bounty | [PR #95](https://github.com/KeeperHub/cli/pull/95); recheck state before submission |

The old V1 address, seven-tool MCP run, `confirm: true` approval convention,
settlement transactions, and video durations are historical evidence only.
They must not be used as current V2 proof.
