# Submission Checklist — DoraHacks Form

**Deadline**: August 13, 2026, 12:00 UTC+2 (08:00 UTC)  
**Form URL**: https://dorahacks.io/hackathon/agents-onchain/detail (logged in)  
**Primary submission**: Main track + optional Best Onboarding UX bounty

---

## Form Fields (Re-Verify Before Filling)

> **CRITICAL**: Open the DoraHacks form logged-in BEFORE submitting. Fields and deadlines may differ from this checklist. Update this file if they do.

### Main Track Required Fields

1. **Team Name**
   - Value: FINALTab (or your team name)
   - Type: Text

2. **GitHub Repository**
   - Value: https://github.com/vaibhav4046/finaltab
   - Type: URL
   - Verify: Link works logged-out, main branch is current

3. **Live Demo URL** (if required)
   - Value: https://finaltab.vercel.app
   - Type: URL
   - Verify: Page loads, proof capsule visible

4. **Demo Video**
   - File: `proof-output/finaltab-demo.mp4` — measured 92.7s (1:33), 1080p, H.264/AAC/MP4, 6,256,484 bytes
   - Type: File upload or YouTube link
   - Verify: Plays end-to-end, no corruption, sound/captions legible
   - Note: an earlier revision of this checklist specified 2:20–2:40. The recorded master is 1:33. If
     the form enforces a minimum length, re-record rather than pad.

5. **Settlement Transaction Hash** (KeeperHub Proof)
   - Value: Copy from proof capsule
   - Example: `0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c`
   - Verify: Link resolves on Base Sepolia block explorer

6. **KeeperHub Execution ID**
   - Value: Copy from proof capsule
   - Example: `g0w11wukbk1v0psyditx4`
   - Verify: Matches the transaction hash's settlement

7. **Project Description** (if free-form)
   - Template:
     ```
     Split a receipt in plain English, settle it as one atomic 
     transaction on Base Sepolia, and never call it settled until 
     KeeperHub and the chain prove it landed. Real EIP-712 signing, 
     deterministic netting, verified onchain execution.
     
     - Receipt extraction via Groq vision
     - Deterministic allocation + netting (engine, 52 tests)
     - EIP-3009 safe authorization pattern (contract, 11 tests)
     - KeeperHub end-to-end integration (verified real tx)
     - Proof: https://finaltab.vercel.app/app/proof?proof=[ID]
     
     Code: https://github.com/vaibhav4046/finaltab
     ```

8. **Team Members**
   - Value: Your name + email (vaibhavlalwani26969@gmail.com if solo)
   - Type: Text

### Best Onboarding UX Bounty (Optional)

> Only if you completed the KeeperHub CLI contribution

1. **Onboarding Contribution URL**
   - Value: https://github.com/KeeperHub/cli/pull/95
   - Type: Link to PR
   - Status: **open, not merged.** Re-verified against the GitHub API on 2026-08-10: opened
     2026-08-09 by `vaibhav4046`, `state: open`, `merged: false`, `draft: false`, 1 commit,
     +336/−15 across 2 files, base `KeeperHub:main`, head
     `vaibhav4046:feat/execute-status-require-verified`.
   - Describe it as **open and under review**. Do not describe it as merged unless GitHub shows
     `merged: true`.

2. **Bounty Selection**
   - Check this box in the form (if available)
   - Contribution: `--require-verified` flag for `kh execute status`
   - Benefit: Any agent can gate settlement on chain-verified receipts

---

## Pre-Submission Verification (DO THIS FIRST)

Run these checks before filling the form:

### Code & Repo
- [ ] `git status` is clean on main branch
- [ ] Latest commit is a43ada3 (Gate 0 docs) or later
- [ ] No secrets in git log or visible files
- [ ] `pnpm -r --if-present test` passes all 189 workspace tests (+11 hardhat = 200 passing, 1 skipped)
- [ ] GitHub repo is public and accessible logged-out

### Settlement & Proof
- [ ] One fresh E2E settlement completed
- [ ] Proof capsule shows: "0 owed", names, amounts, VERIFIED_SETTLED
- [ ] KeeperHub executionId: Copy from proof page
- [ ] Transaction hash: Copy from proof page or Base Sepolia explorer
- [ ] Verify tx hash resolves at https://sepolia.basescan.org/tx/[HASH]
- [ ] Check receipt shows: `verified: true` and `receiptStatus: "success"`

### Video
- [ ] `proof-output/finaltab-demo.mp4` exists and plays end-to-end
- [ ] Duration: 1:33 (92.7s, measured by ffprobe)
- [ ] Audio/captions legible and audible at normal volume
- [ ] Proof capsule visible in final scene (show executionId and tx)
- [ ] File size: <500MB recommended (check for encoding bloat)

### Form & Environment
- [ ] Logged into DoraHacks account
- [ ] Navigated to: https://dorahacks.io/hackathon/agents-onchain/detail
- [ ] Re-verify deadline fields (date, time, timezone)
- [ ] Read eligibility terms: age 18+, jurisdiction, OFAC
- [ ] Accept terms checkbox exists and functional

---

## Copy-Paste Ready Values

**Before submitting**, gather these and paste into a text file as backup:

```
GITHUB_URL: https://github.com/vaibhav4046/finaltab
LIVE_URL: https://finaltab.vercel.app
EXECUTOR_ID: g0w11wukbk1v0psyditx4
TRANSACTION_HASH: 0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c
EXPLORER_LINK: https://sepolia.basescan.org/tx/0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c
VIDEO_FILE: proof-output/finaltab-demo.mp4 (or YouTube link if uploaded)
ONBOARDING_PR: https://github.com/KeeperHub/cli/pull/95 (open, not merged)
DESCRIPTION: [See template above]
TEAM_MEMBER: [Your name] <vaibhavlalwani26969@gmail.com>
```

---

## Submission Day Timeline

| Time | Action |
|------|--------|
| 08:00 UTC | Deadline alert. Form still accepting. |
| 08:15 | Final verification: repo, video, proof links |
| 08:30 | Open DoraHacks form (logged in) |
| 08:35 | Fill all fields from copy-paste list above |
| 08:45 | Review form one final time |
| 08:55 | Click Submit |
| 09:00 | Deadline closes (12:00 UTC+2) |

**Deadline**: August 13, 2026, 12:00 UTC+2 = **08:00 UTC**  
**Safety margin**: 3 hours before, if form allows early submission.

---

## After Submission

1. **Confirm receipt**: Screenshot or email confirmation from DoraHacks
2. **Archive proof**: Save executionId, tx hash, video file, and form screenshot
3. **Monitor finalists**: Shortlist announced around August 17 (check email)
4. **Prepare pitch**: If shortlisted, you'll pitch live August 17–19 (confirm your availability)

---

## Troubleshooting

**Video won't upload:**
- Check file codec (must be H.264 video + AAC audio)
- Try YouTube upload first, paste link in form instead

**Transaction hash doesn't resolve:**
- Verify you're checking on Base Sepolia (https://sepolia.basescan.org), not mainnet
- Check executionId matches the proof capsule

**Deadline passed:**
- Contact DoraHacks support (they may accept late submissions)
- Screenshot proof anyway for retrospective documentation

**Form field missing or different:**
- Update this checklist
- Note the difference and proceed (form is authoritative, not this file)

---

## Final Safety Check

Before clicking Submit, verify:

- [ ] No secrets (API keys, private keys, seed phrases) in any submitted material
- [ ] Transaction is real (verified: true, receiptStatus: success)
- [ ] Video is truthful (no faked states, no old recordings)
- [ ] GitHub link works logged-out
- [ ] Proof capsule executionId matches the transaction
- [ ] Your name and email correct

**Ready to submit?** Click Submit once and only once. Screenshot the confirmation.
