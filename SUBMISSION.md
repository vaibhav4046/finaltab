# FINALTab submission — operational summary

Canonical copy: [docs/submission.md](docs/submission.md)
Operational truth: [docs/release/status.md](docs/release/status.md)
Final gate: [docs/release/SUBMISSION_CHECKLIST.md](docs/release/SUBMISSION_CHECKLIST.md)

## Current verdict

**Not ready to submit.** V2 deployment and exact source matching are proven.
The V2 USDC settlement, unified MCP trace, verified Supabase provisioning,
durably guarded production voice, final video, public video URL, and DoraHacks
confirmation are pending.

Submission categories: **Blockchain, Web3, DeFi, AI Agents, Onchain, MCP,
Autonomous Agents, Infrastructure**. The autonomy claim is deliberately
bounded: agents prepare, simulate, orchestrate, and prove; external debtor
wallet signatures plus a short-lived human approval authorize value movement.

The live DoraHacks project page was rechecked on 2026-08-11. The deadline is
2026-08-13 12:00 UTC+2 (10:00 UTC / 11:00 BST). The form requires a source
link, a short demo video showing the agent executing onchain through KeeperHub,
and a transaction link.

| Surface | State |
|---|---|
| Live app | <https://finaltab.vercel.app> — protected release probe passed 13/13 at main commit `b084497` |
| Authenticated MCP | Live V2 endpoint passed auth, tool-list, calculation, arbitrary-participant planning, proof-binding, and demo-gate probes at `b084497` |
| V2 contract | [`0x7b58791c…cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| V2 deployment | execution `xasakw5nfxkh2s0fh4stn`; [tx `0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f); block `45321107` |
| Source verification | Sourcify exact match `43497805` |
| Hybrid voice candidate | **LOCAL PROVEN — 302 checks + 1 gated skip, 26-route build, Playwright 8/8; Upstash terms, provider config, and live probe pending** |
| V2 settlement | **PENDING — no retained USDC settlement proof** |
| V2 video | **PENDING — no rendered file or public URL** |
| Supabase persistence | **PENDING — schema exists, project is not provisioned** |
| KeeperHub CLI bounty | [PR #95](https://github.com/KeeperHub/cli/pull/95); recheck state before submission |

The old V1 address, seven-tool MCP run, `confirm: true` approval convention,
settlement transactions, and video durations are historical evidence only.
They must not be used as current V2 proof.
