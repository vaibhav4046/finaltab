---
phase: 01-hackathon-endgame
plan: 03
type: checkpoint:human-verify
wave: 4
depends_on: ["01-01", "01-02"]
files_modified: []
autonomous: false
requirements:
  - HACKATHON-QUALITY-GATE
  - HACKATHON-VIDEO-READY

must_haves:
  truths:
    - "Web app loads without errors on finaltab.vercel.app"
    - "Receipt upload + vision extraction works end-to-end"
    - "Settlement execution (via KeeperHub) completes successfully"
    - "No console errors, broken links, or UI glitches visible during normal user flow"
  artifacts:
    - path: "https://finaltab.vercel.app"
      provides: "Live web app, must be deployment-ready"
  key_links:
    - from: "plans 01-01 + 01-02"
      to: "Vercel deployment"
      via: "git push to production branch"

---

<objective>
Quality gate before video recording. Verify entire app works end-to-end, then record demo video.

Purpose: Video is THE deliverable. It must show zero errors, zero spinners stuck, zero fallback states. This gate ensures the app is camera-ready.

Output:
- Verified live app at https://finaltab.vercel.app
- Green light to record demo video
</objective>

<execution_context>
This is a CHECKPOINT task. Claude has completed all code changes in Wave 1-2. Now the user must verify the app works before video recording starts.
</execution_context>

<context>
Plans 01-01 and 01-02 have been executed. All code is deployed to Vercel (or ready to deploy).
</context>

<tasks>

<task type="checkpoint:human-verify">
  <what-built>
Fallback LLM routing (Groq → Claude → OpenAI), image blur detection, mobile bottom nav, CLI expansion, PWA polish.
  </what-built>
  
  <how-to-verify>
**Step 1: Deploy to Vercel** (if not already live)
```bash
cd /d/project/finaltab
git add -A
git commit -m "feat: LLM fallback routing + image quality detection + mobile polish"
git push origin main
# Wait for Vercel deployment to complete (check https://vercel.com)
```

**Step 2: Smoke Test on https://finaltab.vercel.app**
1. Load homepage — should show "MIDNIGHT RECEIPT LAB" heading
2. Click "Settle a Receipt" → Lab page loads
3. Upload a receipt image (any JPG/PNG):
   - Image loads in preview
   - If blurry, yellow warning appears below image
   - Click "Extract" → spinning loader appears
   - Wait 3-5s for extraction to complete
   - Receipt items appear (date, merchant, line items, subtotal)
4. Allocate people: "Vee had the salmon, split the rest evenly" → allocation panel updates
5. Click "Settle" → KeeperHub simulation runs
   - Settlement overview shows people + amounts
   - "Sign & Execute" button appears
   - Click button → spinner, then "VERIFIED_SETTLED" status (or "SIMULATED" if contract deploy is still pending)
6. Go to /app (Home) → should show settled tab in history
7. Click bottom nav icons (mobile: try on Chrome DevTools at 390px width):
   - Home, Settle, Proof, Profile all load without errors
   - Active nav item is highlighted in coral color
8. Open DevTools Console (F12) → NO red errors logged
9. Network tab → No failed requests, no 5xx errors

**Step 3: Verify Fallback Routing (Optional, Manual)**
- In Vercel Environment Variables, temporarily set `GROQ_API_KEY=invalid`
- Upload a receipt again
- Fallback routing kicks in silently; extraction still works (via Claude)
- Check server logs: "provider: claude" should appear
- Restore valid `GROQ_API_KEY`

**Step 4: CLI Quick Check**
```bash
cd /d/project/finaltab
pnpm -r test  # Full test suite must pass
# Output should show ~120 tests passing, 0 failures
```

**Step 5: Deployment Verification**
- Vercel deployment shows "Ready" status
- https://finaltab.vercel.app is live and fast (<2s page load)
- SSL certificate is valid (green lock in browser)
  </how-to-verify>

  <resume-signal>
Once you've completed all 5 steps, reply with:
- **"PASS"** if the app works perfectly, zero errors, ready to record
- **"ISSUES: [list]"** if you found problems (e.g., "extraction times out", "bottom nav not visible")
- Or describe any blockers that prevent video recording
  </resume-signal>
</task>

</tasks>

<verification>
User must confirm:
- [x] Live app loads without errors
- [x] Receipt extraction works end-to-end
- [x] Mobile responsive (390px+)
- [x] Console has no red errors
- [x] All tests pass (pnpm test)
- [x] Deployment is live and fast
</verification>

<success_criteria>
User replies with "PASS" and we proceed directly to video recording.

If issues arise, we pivot to Plan 03B (hotfix) before video.
</success_criteria>

<output>
After verification passes, the user has the green light to record the demo video. Plan 04 (video production) is next.
</output>
