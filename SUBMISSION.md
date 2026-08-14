# FINALTab submission — operational summary

Canonical copy: [docs/submission.md](docs/submission.md)
Operational truth: [docs/release/status.md](docs/release/status.md)
Final gate: [docs/release/SUBMISSION_CHECKLIST.md](docs/release/SUBMISSION_CHECKLIST.md)

## Current verdict

**Submitted and under review.** The [DoraHacks BUIDL](https://dorahacks.io/buidl/47656)
has been submitted, and its Best Onboarding UX Improvement bounty application
is saved. The current canonical deployment is `READY`, and the public 90-second
product film is live. The real production microphone/readback lifecycle remains
unproven. The filmed MCP run stopped before signing, submission, broadcast, or
value movement; the retained settlement is separate and must not be relabeled
as that MCP run.

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
| Live app | <https://finaltab.vercel.app> — `READY`; deployment `dpl_58fvFVcAAUFpP55Pi1aYTp3ot6Fi` at commit `cb8b6484427d30cb31a0a2dd511e617ff42dda06`, which `/api/health` echoes as `commit: cb8b6484427d` |
| Authenticated MCP | **LIVE-PROVEN NON-VALUE SURFACE — exactly nine tools listed; authenticated calculation and arbitrary-participant V2 preparation passed; no submission called** |
| V2 contract | [`0x7b58791c…cCDB`](https://sepolia.basescan.org/address/0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB) |
| V2 deployment | execution `xasakw5nfxkh2s0fh4stn`; [tx `0x904ec881…e8f`](https://sepolia.basescan.org/tx/0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f); block `45321107` |
| Source verification | Sourcify exact match `43497805` |
| Hybrid voice candidate | **SESSION MINTING LIVE-PROVEN; CAPTURE LIFECYCLE PENDING — Supabase spend reservations are applied and sensitive provider variables are configured; a bodyless authenticated `POST /api/voice/token` returns `200` with a real provider session and durable quota headers while a declared request body is still refused with `413`; real microphone-capture and readback lifecycle pending** |
| V2 settlement | **LIVE PROVEN — KeeperHub `3hmlqi36zweiwg6fc5o2u`; [tx `0x7a6fb760…a789`](https://sepolia.basescan.org/tx/0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789); block `45327128`; exactly 1 atomic USDC conserved** |
| V2 video | **PUBLIC/VERIFIED** — <https://youtu.be/eXZACnOdt5w>; 90.005s; 3840×2160 at 60 fps; 5,400 H.264 video frames with AAC audio; 35,617,576 bytes; SHA-256 `a14cfef364c0fe7d4c62e2f9cfb73ca228a692e8738a85d5a6f615e361b09c69`. Narration was generated locally with Kokoro. ElevenLabs received one denied quota-check GET and zero synthesis POSTs; no retry was made. |
| Supabase infrastructure | **LIVE SCHEMA/CUTOVER — `finaltab-production` (`yoavihmldqbkuxinrsih`), London `eu-west-2`, free plan; baseline/additive/cutover/owner-select migrations applied; 31/31 public tables with RLS; sensitive mutation RPCs and legacy direct writes deny browser roles; zero error-level advisor findings, with reviewed warnings including leaked-password protection remaining** |
| Auth and identity | **GITHUB LIVE-PROVEN — canonical OAuth round trip, branded return, `/app`, reload, and authenticated RLS-backed tab create/read passed. Privy remains optional/disabled; email fallback UI remains disabled and delivery unproven.** |
| DoraHacks | [BUIDL 47656](https://dorahacks.io/buidl/47656) is submitted and `Under Review`; Best Onboarding UX Improvement bounty application saved |
| KeeperHub CLI bounty | [PR #95](https://github.com/KeeperHub/cli/pull/95) is open and unmerged; it adds only `--require-verified` |

The old V1 address, seven-tool MCP run, `confirm: true` approval convention,
settlement transactions, and video durations are historical evidence only.
They must not be used as current V2 proof.
