# FINALTab KeeperHub Hackathon Endgame Plan

**Deadline:** TODAY (2026-08-09)  
**Status:** PLAN COMPLETE ✓  
**Live:** https://finaltab.vercel.app  
**Tests:** 119/119 passing

---

## Phase Overview: 01-hackathon-endgame

Four sequential plans split into **4 waves**, designed for parallel execution where possible.

| Wave | Plans | Focus | Parallel? |
|------|-------|-------|-----------|
| **1-2** | 01, 02 | Code infrastructure (LLM fallback, image quality, mobile, CLI) | **YES** — run in parallel |
| **3** | 03 | Quality gate + verification | **Checkpoint** — user verifies live app |
| **4** | 04 | Video production | **Sequential** — code must be live first |

---

## Wave 1: LLM Routing + Image Quality (Plan 01-01)

**What:** Make vision API calls resilient; detect blurry receipts.

**Why:** Groq can rate-limit. During live video demo, a failed Groq call kills the demo. Fallback to Claude/OpenAI silently. Blur detection warns users preemptively.

**Tasks:**
1. `fallbackRouter.ts` — orchestrates Groq → Claude vision → OpenAI routing
2. `imageQuality.ts` — Laplacian edge detection for blur detection
3. Wire into `/api/vision/extract` route
4. Pre-upload warning in Lab UI

**Status:** Ready to execute  
**Estimated time:** 60-90 min  
**Test coverage:** 10+ new tests, no regressions

**Key files:**
- `packages/vision/src/fallbackRouter.ts` (new)
- `packages/vision/src/imageQuality.ts` (new)
- `apps/web/app/api/vision/extract/route.ts` (modified)
- `apps/web/components/Lab.tsx` (modified)

---

## Wave 2: Mobile Polish + CLI Expansion (Plan 01-02)

**What:** Make app mobile-friendly + add CLI commands for power users.

**Why:** Video demo is shot on laptop, but hackathon judges test on phones. Bottom nav makes mobile feel native. CLI lets agents automate settlement verification.

**Tasks:**
1. BottomNav component — sticky nav bar (390px+ only, hidden on desktop)
2. Mobile responsive CSS — padding, touch targets, layout stacking
3. CLI expansion — `finaltab settle`, `finaltab proof`, `finaltab history` commands
4. PWA polish — manifest + service worker verification

**Status:** Ready to execute  
**Estimated time:** 75-100 min  
**Test coverage:** CLI tests + responsive validation

**Key files:**
- `apps/web/components/BottomNav.tsx` (new)
- `apps/web/app/globals.css` (modified)
- `packages/keeperhub-flight-recorder/src/cli.ts` (modified)
- `apps/web/public/manifest.webmanifest` (updated)

---

## Wave 3: Quality Gate (Plan 01-03)

**What:** Checkpoint — user verifies entire app works end-to-end before video.

**Why:** Video is THE deliverable. It must show zero errors, zero broken states.

**Tasks:**
1. Deploy to Vercel
2. Smoke test on https://finaltab.vercel.app
3. Full test suite pass (pnpm test)
4. User signs off: "PASS" or "ISSUES: [list]"

**Status:** Awaiting completion of Wave 1-2  
**Estimated time:** 15-20 min (user verification)

**Blocker handling:** If issues found → Plan 03B (hotfix) before proceeding to video.

---

## Wave 4: Video Production (Plan 04)

**What:** Record, edit, upload 1:38-1:50 demo video.

**Why:** Video is the submission itself. Must show:
- Landing page + hero
- Lab: upload receipt → extraction → allocation → settlement
- KeeperHub execution (simulate or real)
- Verified settlement status
- MCP endpoint demo (if time)
- Bottom nav on mobile
- Architecture flow chart or slide deck

**Tools:**
- **Recording:** Supademo (one-click web flow capture, free tier) OR Playwright + ffmpeg
- **VO:** ElevenLabs (free tier, max ~5min per day; script must fit in 1:50)
- **Editing:** ffmpeg or simple video concatenation (no paid Adobe/Premiere)
- **Upload:** Vercel or GitHub releases for submission

**Estimated time:** 120-180 min (script, record, VO, edit, upload)

**Key deliverables:**
- Video URL in submission (YouTube, Vimeo, or direct link)
- Narration highlights: "KeeperHub-verified settlement", "AI-powered receipt splitting", "one atomic transaction"

---

## Execution Order

### **RIGHT NOW** (You are here)

1. ✅ Plan files created (01-01, 01-02, 01-03)
2. **Next:** Execute Plan 01-01 and 01-02 in parallel
   - Two Claude agents, or
   - Single agent doing Wave 1, then Wave 2 sequentially

### **After Wave 1-2 Complete**

3. User runs quality gate (Plan 03)
   - Deploy to Vercel
   - Test app manually on https://finaltab.vercel.app
   - Verify no console errors, all flows work
   - Reply "PASS" or list issues

### **After Quality Gate Passes**

4. Execute Plan 04 (video production)
   - Record demo flow
   - Add ElevenLabs VO
   - Edit + upload
   - Submit to hackathon

---

## File Organization

```
.planning/
├── 01-hackathon-endgame-PLAN.md         (Wave 1: LLM routing)
├── 01-hackathon-endgame-PLAN-02.md      (Wave 2: Mobile + CLI)
├── 01-hackathon-endgame-PLAN-03.md      (Wave 3: Quality gate)
├── ENDGAME-SUMMARY.md                   (this file)
└── phases/01-hackathon-endgame/
    ├── 01-01-SUMMARY.md                 (after Wave 1 completes)
    ├── 01-02-SUMMARY.md                 (after Wave 2 completes)
    └── 01-03-SUMMARY.md                 (after Wave 3 completes)
```

---

## Parallelization Opportunities

**Wave 1 & 2 can run simultaneously:**
- Plan 01-01 (LLM fallback): modifies `packages/vision/` + routes
- Plan 01-02 (mobile): modifies `apps/web/` components + CLI

No file conflicts. Two agents can work in parallel:
- **Agent 1:** Execute 01-01 (LLM routing + image quality)
- **Agent 2:** Execute 01-02 (mobile + CLI) in parallel

**After both complete:**
- Merge changes
- Run full test suite
- Deploy to Vercel
- Proceed to quality gate (Wave 3)

---

## Critical Path Analysis

**Longest chain:**
1. Wave 1-2 (parallel, 60-100 min each)
2. Merge + test (10 min)
3. Deploy to Vercel (5 min)
4. Quality gate (user verification, 15-20 min)
5. Video production (120-180 min)

**Total:** ~3.5-4.5 hours for code + video.

**Deadline risk:** Video production is longest. Start as soon as quality gate passes.

---

## Dependencies

```
Plan 01-01 (LLM routing)
    ↓
Plan 01-02 (Mobile + CLI) — can run in parallel with 01-01
    ↓
Plan 01-03 (Quality gate) — checkpoint, user must verify
    ↓
Plan 01-04 (Video) — blocked until quality gate passes
```

---

## Success Criteria

### Wave 1-2 Success
- [ ] All new tests pass (fallback routing, image quality, CLI)
- [ ] No regressions (119 tests still pass)
- [ ] Code deploys to Vercel without errors
- [ ] No console errors in browser DevTools

### Wave 3 Success
- [ ] User confirms "PASS" on smoke test
- [ ] Live app works end-to-end
- [ ] No broken flows visible

### Wave 4 Success
- [ ] Video is 1:38-1:50 duration
- [ ] Shows complete flow: upload → extract → settle → verified
- [ ] Audio is clear and professional (ElevenLabs VO)
- [ ] Submitted to hackathon before deadline

---

## Rollback Plan

If Wave 1-2 introduces regressions:
1. `git diff HEAD~1` to see what changed
2. Fix in-place (don't revert whole plans)
3. Re-run `pnpm test` to verify
4. Redeploy

If quality gate fails:
1. Plan 03B (hotfix) — debug and fix blocking issues
2. Re-run quality gate
3. Proceed to video only if all checks pass

---

## What's Locked (User Decisions)

These are NON-NEGOTIABLE. Plans implement them exactly as specified:

1. **D-01:** Fallback LLM routing Groq → Claude → OpenAI
2. **D-02:** Image blur detection + auto-enhance recommendation
3. **D-03:** Device-local identity only (no server accounts)
4. **D-04:** Video 1:38-1:50, Supademo or Playwright+ffmpeg
5. **D-05:** ElevenLabs VO, MCP demo in video
6. **D-06:** Mobile responsive 390px+, bottom nav, PWA
7. **D-07:** CLI tools (settle, proof, history)
8. **D-08:** Production-grade quality, zero errors on camera

---

## Next Action

**Execute Plan 01-01 (Wave 1):**

```bash
cd /d/project/finaltab
# Implement LLM fallback router + image quality detection
# See `.planning/01-hackathon-endgame-PLAN.md` for task details
```

**In parallel, execute Plan 01-02 (Wave 2):**

```bash
cd /d/project/finaltab
# Add mobile bottom nav + CLI expansion
# See `.planning/01-hackathon-endgame-PLAN-02.md` for task details
```

After both complete, run quality gate (Plan 03) and proceed to video production.

---

**Questions? Check the individual PLAN files for detailed action items, verify commands, and test expectations.**
