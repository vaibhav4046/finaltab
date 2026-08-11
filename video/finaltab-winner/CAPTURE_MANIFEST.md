# FINALTab capture manifest

**State:** preproduction only — no browser, wallet, MCP-client, Supademo, or explorer capture has been performed for this film.
**Canonical duration:** 96 seconds.
**Source of truth:** `STORYBOARD.md`, `SCRIPT.md`, `docs/release/MCP_TRACE_SPEC.md`, and one future V2 value-moving run package.

## Non-negotiable capture gates

| Gate | Must be true before capture | Evidence retained |
|---|---|---|
| `G-PRODUCT-FINAL` | The final combined branch passes lint, typecheck, tests, contract tests, production build, and E2E; the rebuilt product is deployed and the logged-out public routes work. | clean gate report, deployment URL and immutable deployment ID |
| `G-V2-CONFIG` | `/api/health` reports the exact Base Sepolia chain, V2 contract `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`, KeeperHub readiness, and the intended auth mode. | sanitized health JSON and timestamp |
| `G-SIGNATURE-SAFE` | The capture uses throwaway Base Sepolia wallets; no key, mnemonic, bearer token, cookie, wallet debug export, or provider dashboard can enter the frame. | manual frame scan plus automated secret scan |
| `G-V2-VALUE-MOVE` | A fresh, non-zero, V2 USDC settlement has executed through KeeperHub. Its execution ID and transaction are different from the V2 deployment execution `xasakw5nfxkh2s0fh4stn` and deployment transaction `0x904ec881...e8f`. | redacted MCP trace, KeeperHub receipt, RPC receipt/event proof, before/after balances, conservation check |
| `G-MCP-LIVE-LIST` | An authenticated live `tools/list` returns twelve tools: nine production tools and three explicitly `demo_*` tools. The latter are testnet-only and disabled by default. | redacted request/response pair, client name/version |
| `G-MCP-V2-SAME-RUN` | The visible MCP sequence, KeeperHub receipt, proof capsule, balance deltas, and explorer transaction all describe the same V2 settlement run. | shared `runId`, trace manifest hashes, exact three proof identifiers |
| `G-PUBLIC-LINKS` | Product, GitHub, MCP discovery, KeeperHub workflow, Sourcify, and fresh transaction links work logged out. | link-check record captured immediately before render |

If any gate fails, leave the affected storyboard frame `outline`; never substitute old V1 footage, the V2 deployment proof, a fixture response, or an optimistic green state.

## Capture environment lock

- Canvas source: Chromium at 1920×1080, device scale factor 1, browser zoom 100 percent, system scaling accounted for, no browser chrome in the final crop.
- Product capture: Playwright-controlled, deterministic route setup and real interaction timing. Record silent WebM or lossless image sequences; HyperFrames owns the final edit, captions, narration, BGM, and SFX.
- MCP capture: use a real named MCP client and retain its exact version. Preferred order is an actually configured OpenAI client with MCP support, then Codex CLI. Never label Codex CLI as “ChatGPT CLI.” If ChatGPT Developer Mode is used, show the real ChatGPT surface and record that exact client in `trace.start`.
- Supademo: optional secondary guide only when it materially improves a complex interaction. It cannot be the proof source, replace the raw capture, invent a result, or obscure identifiers.
- Browser data: fresh isolated test profile, no personal bookmarks, emails, wallet history, extensions, or autofill. Only Base Sepolia throwaway accounts.
- Timing: capture interactions with 1.0–1.5 seconds of clean handles before and after every required state. Do not accelerate a loading state into a false chronology.
- Legibility: product UI and command output must remain at least 20 px after final 1920×1080 composition. Crop or use motivated focus locks instead of shrinking an entire page.
- Redaction: redact at capture source when possible. Any remaining redaction is an opaque block marked `[REDACTED]`; never keep a secret prefix or suffix.

## Planned capture assets

Every path below is a target, not an existing artifact. The filename may be staged only after its gate passes.

### C03 — Complex product flow

- Target: `assets/capture/C03-complex-product-flow.mp4`
- Route: `/app/tab` on the final production deployment.
- Source state: live mode; a synthetic, PII-free, complex USD receipt; payer plus at least four additional participants; no fixed Vee/Hem/Ravi fixture.
- Required actions: consent to receipt processing; upload; correct one intentionally imperfect extracted line; confirm arithmetic; add participants; create an invite only if cloud persistence is configured; allocate from a complex natural-language instruction; show tax, tip, and service; land `SUM = RECEIPT TOTAL`.
- Required assertions: every share is in integer minor units; final shares sum exactly to receipt total; any cloud invite works in a separate logged-out profile before it is shown.
- Gate: `G-PRODUCT-FINAL`, `G-V2-CONFIG`; cloud subsection additionally requires production Supabase readiness.
- Story use: Frame 3.

### C04 — Net, freeze, and plan binding

- Target: `assets/capture/C04-net-freeze-bind.mp4`
- Route: the same `/app/tab` session and receipt as C03.
- Required actions: reveal raw obligations; run deterministic netting; freeze the ledger; show `ledgerHash`, `settlementId`, debits, payouts, chain `84532`, and the V2 contract.
- Required assertions: frozen plan values match the later MCP trace; a revision action explicitly discards approvals; no V1 address appears.
- Gate: `G-PRODUCT-FINAL`, `G-V2-CONFIG`.
- Story use: Frame 4.

### C05 — Dual signatures and simulation boundary

- Target: `assets/capture/C05-dual-consent-simulate.mp4`
- Route: the same product settlement room.
- Required actions: recover the correct public signer for every debtor's `ReceiveWithAuthorization` and `SettlementConsent`; simulate the exact signed payload through KeeperHub; separately capture a genuine invalid/reverting payload returning `WOULD REVERT · NOT BROADCAST`.
- Required assertions: the passed simulation reports no broadcast; the failure insert is from a real request and never transitions to execute; no raw wallet secret or auth header enters the recording.
- Gate: `G-SIGNATURE-SAFE`, `G-V2-CONFIG`.
- Story use: Frame 5.

### C06 — Fresh KeeperHub execution and independent proof

- Targets: `assets/capture/C06-v2-keeperhub-proof.mp4`, `assets/capture/C06-v2-proof-capsule.png`.
- Route: product execution/proof routes plus the public explorer link for the same future run.
- Required actions: show passed simulation; show the real final human approval boundary if implemented in the product path; submit through KeeperHub; poll; open the dynamic proof capsule; reveal independent RPC receipt, exact indexed `settlementId` and `ledgerHash`, participant balance deltas, and conservation.
- Placeholder bindings that must be replaced from one manifest:
  - `{{RUN_ID}}`
  - `{{V2_SETTLEMENT_EXECUTION_ID}}`
  - `{{V2_SETTLEMENT_TX_HASH}}`
  - `{{V2_SETTLEMENT_BLOCK}}`
  - `{{SETTLEMENT_ID}}`
  - `{{LEDGER_HASH}}`
- Forbidden values in the value-moving proof shot:
  - execution `xasakw5nfxkh2s0fh4stn` — V2 contract deployment only;
  - transaction `0x904ec881ef7c2ec7375c20887b4181cf58224b44162d837743fa869b0a598e8f` — V2 contract deployment only;
  - every historical V1 execution, contract, and transaction.
- Gate: `G-V2-VALUE-MOVE`, `G-SIGNATURE-SAFE`, `G-MCP-V2-SAME-RUN`.
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
- Separate footer: `demo_get_balances`, `demo_prepare_settlement`, and `demo_settle_tab` are testnet-only, disabled by default, and not part of the production grid.
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
- Forbidden: raw bearer token, token digest, cookies, authorization header, private key, mnemonic, `.env`, provider dashboard, fake typing, `confirm: true`, fixed-wallet `demo_*` tools, or an execution from another run.
- Gate: `G-MCP-V2-SAME-RUN`, `G-SIGNATURE-SAFE`, `G-MCP-LIVE-LIST`.
- Story use: Frame 8.

## Generated, non-capture assets

- `G01` — FINALTab receipt-edge mark, rebuilt as seek-safe SVG from `apps/web/components/FinalTabMark.tsx`; do not reuse the deleted Figma scaffold logo.
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

A take is usable only when every visible success is backed by the same retained source record, all text is readable at delivery size, chronology is real, public identifiers reconcile, no prohibited secret appears in any sampled or cut-adjacent frame, and the capture's gate is marked pass. Otherwise discard the take and record a new one.
