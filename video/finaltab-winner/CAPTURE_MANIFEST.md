# FINALTab capture manifest

**State:** composition source and verified chain-proof overlay are built; the
ordered additive Supabase schema is applied and verified. Privy's paid
custom-auth bridge is optional, deliberately disabled, and excluded from this
release's captures; final production probes and real browser,
wallet, MCP-client, and explorer captures remain open. Current ElevenLabs
audio/captions are a provisional script pass and must be regenerated after
approved captures. No final render exists.
**Canonical duration:** 96 seconds.
**Final delivery target:** 3840×2160 at 60 fps (5,760 frames).
**Source of truth:** `STORYBOARD.md`, `SCRIPT.md`, `docs/release/MCP_TRACE_SPEC.md`, and the verified one-atomic-unit V2 run sanitized in `data/release-proof.json`.

## Non-negotiable capture gates

| Gate | Must be true before capture | Evidence retained |
|---|---|---|
| `G-PRODUCT-FINAL` | The final combined branch passes lint, typecheck, tests, contract tests, production build, and E2E; the rebuilt product is deployed and the logged-out public routes work. | clean gate report, deployment URL and immutable deployment ID |
| `G-V2-CONFIG` | `/api/health` reports the exact Base Sepolia chain, V2 contract `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`, KeeperHub readiness, and the intended auth mode. | sanitized health JSON and timestamp |
| `G-SIGNATURE-SAFE` | The capture uses throwaway Base Sepolia wallets; no key, mnemonic, bearer token, cookie, wallet debug export, or provider dashboard can enter the frame. | manual frame scan plus automated secret scan |
| `G-V2-VALUE-MOVE` | The retained non-zero V2 USDC settlement executed through KeeperHub. Its execution ID and transaction differ from the V2 deployment execution `xasakw5nfxkh2s0fh4stn` and deployment transaction `0x904ec881...e8f`. | sanitized one-atomic-run manifest, KeeperHub receipt, RPC receipt/event proof, before/after balances, conservation check; no MCP-broadcast claim |
| `G-MCP-LIVE-LIST` | An authenticated live `tools/list` returns exactly nine production tools and no retired fixed-wallet name. | redacted request/response pair, client name/version |
| `G-MCP-V2-SAME-RUN` | The visible MCP sequence, KeeperHub receipt, proof capsule, balance deltas, and explorer transaction all describe the same V2 settlement run. | shared `runId`, trace manifest hashes, exact three proof identifiers |
| `G-AUTH-LIVE` | Supabase-brokered GitHub sign-in, one-time callback, branded return, sign-out, and protected-route redirects pass on the promoted canonical origin `https://finaltab.vercel.app`. OAuth is never initiated on an immutable Vercel hostname because its PKCE cookies are host-bound. The current no-charge release must show no Privy setup warning, identity chip, or runtime. | redacted browser trace and route/header assertions |
| `G-AGENT-REVIEW-LIVE` | The ordered additive migrations are applied; four stages run in order; pre-submission proof is honestly skipped; forged provenance is hidden; an upstream edit invalidates the review; a fresh attested run unlocks Freeze with the durable receipt UUID. | migration verification, run/event IDs, HMAC-safe logs, tenant-isolation probe |
| `G-PUBLIC-LINKS` | Product, GitHub, MCP discovery, KeeperHub workflow, Sourcify, and fresh transaction links work logged out. | link-check record captured immediately before render |
| `G-FINAL-AUDIO-SYNC` | All approved visual takes are locked; ElevenLabs narration and alignment are regenerated from the approved script; baked/external captions and scene timing are rebuilt from that final alignment and manually checked against the captures. | final voice manifest with per-scene hashes, final cue sheet/SRT, sync review record |

If any gate fails, leave the affected storyboard frame `outline`; never substitute old V1 footage, the V2 deployment proof, a fixture response, or an optimistic green state.

## Capture environment lock

- Canvas source: Chromium at 3840×2160, browser zoom 100 percent, system scaling
  accounted for, no browser chrome in the final crop. Every accepted capture
  plate must retain native 4K detail after the final crop.
- Product capture: Playwright-controlled, deterministic route setup and real interaction timing. Record silent WebM or lossless image sequences; HyperFrames owns the final edit, captions, narration, BGM, and SFX.
- MCP capture: use a real named MCP client and retain its exact version. Preferred order is an actually configured OpenAI client with MCP support, then Codex CLI. Never label Codex CLI as “ChatGPT CLI.” If ChatGPT Developer Mode is used, show the real ChatGPT surface and record that exact client in `trace.start`.
- Supademo: optional secondary guide only when it materially improves a complex interaction. It cannot be the proof source, replace the raw capture, invent a result, or obscure identifiers.
- Browser data: fresh isolated test profile, no personal bookmarks, emails, wallet history, extensions, or autofill. Only Base Sepolia throwaway accounts.
- Timing: capture interactions with 1.0–1.5 seconds of clean handles before and after every required state. Do not accelerate a loading state into a false chronology.
- Legibility: product UI and command output must remain at least 40 px in the
  3840×2160 master. Crop or use motivated focus locks instead of shrinking an
  entire page.
- Redaction: redact at capture source when possible. Any remaining redaction is an opaque block marked `[REDACTED]`; never keep a secret prefix or suffix.

## Planned capture assets

Every path below is a target, not an existing artifact. The filename may be staged only after its gate passes.

### C03 — Complex product flow

- Target: `assets/capture/C03-complex-product-flow.mp4`
- Route: `/app/tab` on the final production deployment.
- Source state: live mode; a synthetic, PII-free, complex USD receipt; payer plus
  at least four additional participant names and external wallet addresses
  entered by the user. A receipt without names may not manufacture them.
- Required actions: complete the branded account return into a newly created
  durable tab; consent to receipt processing; upload; correct one intentionally
  imperfect extracted line; confirm arithmetic; add participants; create an
  invite only after the multi-identity probe; allocate from a complex
  natural-language instruction; show tax, tip, and service; land
  `SUM = RECEIPT TOTAL`.
- Required assertions: every share is in integer minor units; final shares sum exactly to receipt total; any cloud invite works in a separate logged-out profile before it is shown.
- Gate: `G-PRODUCT-FINAL`, `G-V2-CONFIG`, `G-AUTH-LIVE`; cloud subsection
  additionally requires the production multi-identity Supabase probe. Omit all
  Privy identity UI in this no-charge release.
- Story use: Frame 3.

### C04 — Net, freeze, and plan binding

- Target: `assets/capture/C04-net-freeze-bind.mp4`
- Route: the same `/app/tab` session and receipt as C03.
- Required actions: reveal raw obligations; run deterministic netting; show the
  four-stage attested review; edit one upstream value and show the review become
  stale; rerun it; Freeze using the durable receipt UUID; show `ledgerHash`,
  `settlementId`, debits, payouts, chain `84532`, and the V2 contract.
- Required assertions: stage order is fixed; proof preflight is honestly skipped
  before submission; memory is bounded audit memory, not self-evolution; frozen
  plan values match the later MCP trace; no V1 address appears.
- Gate: `G-PRODUCT-FINAL`, `G-V2-CONFIG`, `G-AGENT-REVIEW-LIVE`.
- Story use: Frame 4.

### C05 — Dual signatures and simulation boundary

- Target: `assets/capture/C05-dual-consent-simulate.mp4`
- Route: the same product settlement room.
- Required actions: recover the correct public signer for every debtor's `ReceiveWithAuthorization` and `SettlementConsent`; simulate the exact signed payload through KeeperHub; separately capture a genuine invalid/reverting payload returning `WOULD REVERT · NOT BROADCAST`.
- Required assertions: the passed simulation reports no broadcast; the failure
  insert is from a real request and never transitions to execute; no raw wallet
  secret or auth header enters the recording. No Privy identity should appear;
  ExecutionRail requires the explicit external participant wallet.
- Gate: `G-SIGNATURE-SAFE`, `G-V2-CONFIG`.
- Story use: Frame 5.

### C06 — Retained KeeperHub execution and independent proof

- Targets: `assets/capture/C06-v2-keeperhub-proof.mp4`, `assets/capture/C06-v2-proof-capsule.png`.
- Route: product proof route plus the public explorer link for the retained
  one-atomic-unit V2 run in `data/release-proof.json`.
- Required actions: open the dynamic proof capsule; reveal KeeperHub receipt,
  independent RPC receipt, exact indexed `settlementId` and `ledgerHash`, balance
  deltas, and conservation. Do not rebroadcast this run or imply its standalone
  runner exercised the MCP human-approval route.
- Forbidden values in the value-moving proof shot:
  - execution `xasakw5nfxkh2s0fh4stn` — V2 contract deployment only;
  - transaction `0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f` — V2 contract deployment only;
  - every historical V1 execution, contract, and transaction.
- Gate: `G-V2-VALUE-MOVE`, `G-SIGNATURE-SAFE`. `G-MCP-V2-SAME-RUN` remains a
  separate hard gate if the film claims an MCP broadcast.
- Story use: Frame 6 and Frame 9 transaction line.

### C07 — MCP developer surface and live tool list

- Target: `assets/capture/C07-developer-mcp-surface.png`.
- Route: `/developers` plus a real authenticated `tools/list` response.
- Nine production tools, in exact display order:
  1. `split_equal`
  2. `split_weighted`
  3. `net_debts`
  4. `allocate_receipt`
  5. `prepare_receipt_settlement`
  6. `simulate_signed_settlement`
  7. `create_broadcast_approval_challenge`
  8. `submit_signed_settlement`
  9. `settlement_status`
- Footer: `EXACTLY 9 · EXTERNAL WALLETS · BASE SEPOLIA`.
- Gate: `G-MCP-LIVE-LIST`, `G-PUBLIC-LINKS`.
- Story use: Frame 7.

### C08 — Real MCP V2 climax

- Target: `assets/capture/C08-real-mcp-v2-run.mp4`.
- Client: exact real client name/version from `trace.start`; no synthetic terminal or prewritten chat response.
- Endpoint: `https://finaltab.vercel.app/api/mcp` after the V2 production redeploy.
- Required visible sequence:
  1. authenticated `initialize` and `tools/list` establish the real server;
  2. `allocate_receipt`;
  3. `prepare_receipt_settlement`;
  4. public signature events for both typed-data payloads per debtor;
  5. `simulate_signed_settlement` with `broadcast: false`;
  6. `create_broadcast_approval_challenge`;
  7. explicit pause while a human reviews and personal-signs the exact short-lived challenge;
  8. `submit_signed_settlement`;
  9. one or more calls using the exact input shape `settlement_status({ executionId, settlementId, ledgerHash })`;
  10. KeeperHub receipt plus independent exact-event proof resolves `VERIFIED_SETTLED`.
- Required framing: the three status arguments must be legible together; they must come from the same submission response. Show a small chain-of-custody rail linking them to the final event.
- Forbidden: raw bearer token, token digest, cookies, authorization header,
  private key, mnemonic, `.env`, provider dashboard, fake typing, `confirm: true`,
  any retired fixed-wallet tool, or an execution from another run.
- Authorization boundary: the retained one-atomic-unit run cannot be relabelled
  as this MCP chronology. A new MCP broadcast requires separate explicit
  value-moving authorization; otherwise capture only non-broadcast tools plus a
  clearly labelled read-only `settlement_status` lookup of the retained run, and
  leave `G-MCP-V2-SAME-RUN` failed.
- Gate: `G-MCP-V2-SAME-RUN`, `G-SIGNATURE-SAFE`, `G-MCP-LIVE-LIST`.
- Story use: Frame 8.

## Generated, non-capture assets

- `G01` — text-only FINALTab wordmark with a seek-safe receipt-rule reveal;
  do not introduce a symbol logo or reuse the deleted Figma scaffold mark.
- `G02` — receipt-to-proof architecture rail, generated only from V2 contract/MCP evidence mapped in `EVIDENCE_MAP.md`.
- `G03` — Frame 9 end-card text fields, populated from the final release manifest; unresolved placeholders are a build failure.

## Take log template

For each take, append one row to the eventual run manifest:

| Field | Value |
|---|---|
| capture ID | `C03`–`C08` |
| take | integer |
| UTC start | ISO-8601 |
| app deployment | immutable Vercel deployment URL/ID |
| git commit | full SHA |
| run ID | shared V2 proof UUID or `not-applicable` |
| client/browser version | exact string |
| source size/fps | measured, not assumed |
| crop | left, top, width, height |
| audio | none |
| secrets review | pass/fail + reviewer |
| evidence consistency | pass/fail + manifest SHA-256 |

## Capture acceptance

A take is usable only when every visible success is backed by the same retained
source record, all text is readable in the 3840×2160 master, chronology is real,
public identifiers reconcile, no prohibited secret appears in any sampled or
cut-adjacent frame, and the capture's gate is marked pass. Otherwise discard the
take and record a new one.
