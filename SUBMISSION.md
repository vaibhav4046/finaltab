# FINALTab submission — operational summary

Canonical copy: [docs/submission.md](docs/submission.md)
Operational truth: [docs/release/status.md](docs/release/status.md)
Final gate: [docs/release/SUBMISSION_CHECKLIST.md](docs/release/SUBMISSION_CHECKLIST.md)

## Current verdict

**Not ready to submit.** V2 deployment, exact source matching, one value-moving
V2 settlement, and the additive Supabase schema are proven: baseline plus
`52236`, `60000`, `64822`, `73000`, and `74000`, with 29/29 public tables under
RLS and server-only authority on sensitive mutation RPCs. The post-promotion
`74500` cutover, Privy dashboard configuration, unified nine-tool MCP trace, post-deploy
application/provider probe, final video, public video URL, and DoraHacks
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
| Authenticated MCP | Current source contains exactly nine production tools; its superseded `b084497` deployment baseline passed auth, calculation, arbitrary-participant planning, and proof-binding probes, but the new nine-tool deployment still needs a live recheck |
| V2 contract | [`0x7b58791c…cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| V2 deployment | execution `xasakw5nfxkh2s0fh4stn`; [tx `0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f); block `45321107` |
| Source verification | Sourcify exact match `43497805` |
| Hybrid voice candidate | **CONFIGURED, NOT LIVE-PROBED — Supabase minute quotas and spend reservations are applied and sensitive provider variables are configured; final local suite is 370 passed + 1 provider-gated skip and the build generated 33/33 pages; provider lifecycle probe pending** |
| V2 settlement | **LIVE PROVEN — KeeperHub `3hmlqi36zweiwg6fc5o2u`; [tx `0x7a6fb760…a789`](https://sepolia.basescan.org/tx/0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789); block `45327128`; exactly 1 atomic USDC conserved** |
| V2 video | **PENDING — no rendered file or public URL** |
| Supabase infrastructure | **ADDITIVE SCHEMA VERIFIED — `finaltab-production` (`yoavihmldqbkuxinrsih`), London `eu-west-2`, free plan; four baseline plus five ordered additive migrations applied; 29/29 public tables with RLS; sensitive mutation RPCs deny browser roles and allow `service_role`; no advisor errors; unindexed-FK warning cleared; post-promotion `74500` and application deploy/probe pending** |
| Auth and identity | **CODE COMPLETE, FAIL-CLOSED — Supabase login/create-account/callback and branded return page implemented; Privy dashboard/JWKS/domain/identity-token/verifier configuration and live probe pending; branded inbound email pending verified-domain SMTP or Send Email Hook** |
| KeeperHub CLI bounty | [PR #95](https://github.com/KeeperHub/cli/pull/95); recheck state before submission |

The old V1 address, seven-tool MCP run, `confirm: true` approval convention,
settlement transactions, and video durations are historical evidence only.
They must not be used as current V2 proof.
