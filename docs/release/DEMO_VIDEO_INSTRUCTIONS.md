# Demo video recording — historical V1 plan

> **SUPERSEDED — this is the original V1 plan, not the V2 submission spec.**
>
> A historical V1 file was measured at **101.64s**, 1920×1080, H.264/AAC,
> 7,472,357 bytes on 2026-08-10. It is not present in this checkout and it does
> not show the final MCP agent story. An older 92.7-second cut is also
> superseded. Neither file is the current submission deliverable.
>
> The timings below are archived cue points. The V2 URL, duration, metadata,
> and final scene plan remain pending until the new agent/MCP video is rendered.
> Current status: [status.md](status.md). Capture contract:
> [MCP_TRACE_SPEC.md](MCP_TRACE_SPEC.md).

**Original target**: 2:20–2:40 (one continuous, truthful, representative take)  
**Quality**: 1920×1080, 30fps minimum  
**Audio**: Narration or captions (legible, audible)  
**Evidence**: Real Base Sepolia settlement end-to-end with verified receipt

---

## Storyboard (Exact Timing)

| Time | Content | Truth | Action |
|------|---------|-------|--------|
| 0:00–0:08 | **Cold open** | Real settlement from THIS run | Proof capsule showing 6 obligations → 2 transfers → 0 owed, VERIFIED_SETTLED badge |
| 0:08–0:18 | **Problem & promise** | Your words | "Split a receipt in plain English, settle it as one onchain transaction, verify it landed." |
| 0:18–0:35 | **Receipt** | Real or synthetic (label it) | Upload receipt → Groq extracts → Show line items, total, arithmetic |
| 0:35–0:55 | **Allocation** | Real Groq proposal | Enter participant names → Say allocation in plain English → Engine netting → Show debts → frozen ledger |
| 0:55–1:10 | **Participant consent** | Real EIP-712 signatures | Each debtor's name → signature nonce display (show it's bound to ledgerHash) |
| 1:10–1:25 | **Failure scenario** | Intentional (expired auth or invalid sig) | Click simulate → "Would revert" error → Show "Nothing was broadcast" → Fix it |
| 1:25–2:10 | **Real execution** | KeeperHub live flow | Simulate (success, wouldRevert: false) → Execute (one broadcast) → Poll to completion → Terminal verdict showing verified: true, receiptStatus: success |
| 2:10–2:28 | **Proof** | Your proof capsule from this run | Human-readable: who owed what, how it netted, execution ID, tx link. One click to technical tab showing events, balance deltas. |
| 2:28–2:40 | **Close** | Your words | One sentence on why this matters (e.g., "No settlement happens until the chain proves it landed") + GitHub/KeeperHub callout |

---

## What You'll Record (Step by Step)

### Pre-Recording Checklist

- [ ] Dev server running: `cd apps/web && pnpm dev` (http://localhost:3017)
- [ ] Browser console ready (F12, filter for `[doSign]` and `[signAllTransfers]` logs)
- [ ] One test settlement freshly executed (copy executionId and tx hash)
- [ ] Screen resolution at **1920×1080** (if recording desktop; 1280×720 minimum)
- [ ] Narration script printed or nearby (or plan captions in post)
- [ ] Recording tool open (OBS, ScreenFlow, Camtasia, or built-in screen record)

### Recording Flow (Rehearse Once)

1. **Scene 1: Proof Capsule (0:00–0:08)**
   - Navigate to `/app/proof`
   - Show the VERIFIED_SETTLED badge and "0 owed" state
   - Pan to the "6 → 2 → 0" summary
   - Clean cut

2. **Scene 2: Problem Statement (0:08–0:18)**
   - Back to `/app/tab` (fresh page or post-proof view)
   - **Read/say**: "Split a shared receipt in plain English. One atomic onchain settlement. Verify it landed on Base Sepolia."
   - Clean cut

3. **Scene 3: Receipt (0:18–0:35)**
   - **Upload receipt**
     - If using sample: show the file picker, select a test receipt image
     - If creating: show a clear receipt (restaurant, shopping, etc.)
   - **Show extraction**: Groq pulls items, amounts, tax, total
   - Pause on the arithmetic (show it's correct)
   - Clean cut

4. **Scene 4: Allocation & Netting (0:35–0:55)**
   - Click through to allocation panel
   - **Type/say**: Allocation query in plain English
     - Example: "Vee had the naan and half the daal. Hem and Ravi split the rest evenly."
   - Show Groq proposal
   - Show engine reconciliation (arithmetic confirmed)
   - Show frozen ledger (canonical JSON hash)
   - Show netting result: raw → netted transfers
   - Clean cut

5. **Scene 5: Signing (0:55–1:10)**
   - Scroll to Sign section
   - For each debtor: show name → signature nonce display
   - **Say**: "Real EIP-712 signatures. Nonce bound to the frozen ledger hash."
   - If showing console: quick peek at `[signAllTransfers] Got signature: 0x...`
   - Clean cut

6. **Scene 6: Failure (1:10–1:25)** — OPTIONAL but impactful
   - If you have an expired authorization test ready: simulate it, show the "Would revert" error
   - **Say**: "Bad authorization → simulation rejects it → nothing broadcast."
   - Show the refresh/retry button
   - Clean cut

7. **Scene 7: Real Execution (1:25–2:10)** — MUST BE TRUTHFUL
   - Click **Simulate**
     - Show KeeperHub response: `success: true, wouldRevert: false`
   - Click **Execute**
     - Show broadcasting in progress
   - **Wait for poll to complete** (30–60s)
     - Show status changing: `pending` → `completed`
   - Show final verdict: `verified: true, receiptStatus: success`
   - **Slow pan** to executionId and tx hash (legible on screen)
   - Clean cut

8. **Scene 8: Proof Capsule & Technical Detail (2:10–2:28)**
   - Navigate to or scroll to proof capsule
   - **Human view**: Show "0 owed" outcome, who paid whom, amounts
   - Click "Technical" or similar to reveal:
     - Settlement contract address
     - USDC token address
     - Frozen ledger hash
     - Nonces and signatures
     - Events table (if rendered)
     - Balance deltas
   - **Say**: "Full technical proof linked to KeeperHub execution."
   - Clean cut

9. **Scene 9: Close (2:28–2:40)**
   - Back to landing or proof page
   - **Say**: "Settlement lives on Base Sepolia. Code on GitHub. Built for KeeperHub Agents Onchain."
   - Show GitHub repo link (or text overlay)
   - Fade out or hard cut

---

## Audio & Captions

**Narration Script** (Total ~145–160 words, ~2:20–2:40 @150 wpm)

```
[0:00–0:08]
[Silent, visual only]

[0:08–0:18]
"Split a shared receipt in plain English. 
One atomic settlement. 
Verify it landed on Base Sepolia."

[0:18–0:35]
"Real Groq vision extracts each line item, total, and tax.
The arithmetic is deterministic—the engine, not the model, decides.
[Show receipt, extraction, reconciliation]
Exact to the cent."

[0:35–0:55]
"Participants tell us who had what in plain language.
Groq proposes; the engine confirms.
Six obligations collapse into two deterministic netted transfers.
Ledger frozen. Hash locked. Ready to sign."

[0:55–1:10]
"Each debtor signs once.
EIP-712 signature, nonce-bound to the frozen ledger.
Change anything, and the hashes no longer match.
All signatures void."

[1:10–1:25]
"Simulation first. If authorization fails—expired, wrong nonce, wrong chain—
we know before broadcasting. Nothing touches the blockchain."

[1:25–2:10]
[Silent during real execution; let the UI tell the story]
[Show simulate → execute → poll → VERIFIED_SETTLED]

[2:10–2:28]
"Proof. Human-readable and cryptographically verified.
Zero owed. Exact execution ID and transaction hash on Base Sepolia.
KeeperHub broadcast, chain confirmed, receipts verified."

[2:28–2:40]
"No settlement is settled until the chain proves it.
That's FINALTab. Built for KeeperHub Agents.
Code and proof on GitHub."
```

---

## Technical Checklist for Video

- [ ] **Screen is readable**: text is ≥16px, hashes/amounts visible at distance
- [ ] **No secrets shown**: no private keys, no API keys, no personal data
- [ ] **Smooth playback**: no jank, no long freezes (acceptable: 1–2 second waits during network calls)
- [ ] **Audio legible**: captions if narration, or overlay text for key steps
- [ ] **Proof is REAL**: executionId and tx hash match the live app's display
- [ ] **One continuous clip**: preferably one take from start to finish (if retakes needed, edit cleanly)
- [ ] **Duration 2:20–2:40**: aim for 2:30 (dead center)
- [ ] **Codecs**: H.264 video, AAC audio, MP4 container (widely compatible)
- [ ] **Export at 1920×1080 30fps** or 1280×720 30fps minimum

---

## Post-Recording

1. **Verify playback**: Watch the final export end-to-end at 50% screen size
2. **Check audio**: legible at volume levels
3. **Check proof link**: executionId and tx hash are clickable (if embedded) or clearly readable
4. **Check duration**: `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1:precision=1 demo-video.mp4`
5. **Record provenance**: write the actual render time, duration, checksum, and
   public URL into [status.md](status.md). Plan the upload buffer against the
   live-form deadline verified on 2026-08-11: 2026-08-13 12:00 UTC+2
   (10:00 UTC / 11:00 BST).

---

## Fallback Options

**If live execution fails during recording:**
- Use the proven live settlement (executionId `dthckv3julum6m5ktmdik`, tx `0x7bf655f3…45c12d`, block 45310631, 8.00 USDC moved atomically 2026-08-10, verified: true); older zero-value rail proof: `g0w11wukbk1v0psyditx4`, tx `0x1130...278c`
- Label clearly: "Previously recorded proven execution"
- Show the exact same settlement flow logic (same app, same code)

**If audio tools unavailable:**
- Use on-screen text overlays for narration points
- Or use subtitle-style lower-third captions synced to action
- Silence is acceptable if the UI clearly tells the story

---

## Success Criteria

✓ Settlement from cold to VERIFIED_SETTLED on screen  
✓ Proof capsule shows 0 owed, participant names, tx link  
✓ Narration or captions explain each phase  
✓ No secrets, no hallucination, no faked state  
✓ Legible at any reasonable playback size  
✓ V2 URL and measured metadata recorded in the canonical status document
