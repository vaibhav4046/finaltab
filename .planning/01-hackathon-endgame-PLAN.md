---
phase: 01-hackathon-endgame
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: 
  - packages/vision/src/groqClient.ts
  - packages/vision/src/fallbackRouter.ts
  - apps/web/lib/imageOptimization.ts
  - apps/web/components/Lab.tsx
autonomous: true
requirements: 
  - KEEPERHUB-VISION-ROBUST
  - HACKATHON-VIDEO-READY
  - USER-EXPERIENCE-POLISH

must_haves:
  truths:
    - "Groq vision fails gracefully and routes to Claude if Groq API is down"
    - "Blurry receipts (low contrast/soft focus) are detected and user is warned"
    - "LLM routing is transparent to user (fallback happens silently)"
  artifacts:
    - path: "packages/vision/src/fallbackRouter.ts"
      provides: "LLM routing logic with Groq → Claude → OpenAI precedence"
      min_lines: 80
    - path: "packages/vision/src/imageQuality.ts"
      provides: "Blur detection and enhancement recommendation"
      min_lines: 50
    - path: "apps/web/lib/imageOptimization.ts"
      provides: "Client-side image quality checks before upload"
      min_lines: 40
  key_links:
    - from: "apps/web/app/api/vision/extract"
      to: "packages/vision/src/fallbackRouter.ts"
      via: "server-side route handler"
    - from: "apps/web/components/Lab.tsx"
      to: "apps/web/lib/imageOptimization.ts"
      via: "pre-upload quality warning"

---

<objective>
Implement fallback LLM routing + image quality detection to make FINALTab robust enough for live demo video.

Purpose: Groq can rate-limit; Claude and OpenAI provide fallback. Blurry receipts break the pipeline; detect and warn preemptively.

Output: 
- `packages/vision/src/fallbackRouter.ts` — orchestrates Groq → Claude vision → OpenAI routing
- `packages/vision/src/imageQuality.ts` — blur detection via edge contrast analysis
- Updated `/api/vision/extract` route to use fallback routing
- Pre-upload warning in Lab UI when image quality is low
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md

This plan enables the video demo to work reliably. A failed Groq call no longer kills the demo.
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md

Reference projects:
- @packages/vision/src/groqClient.ts (existing Groq integration)
- @packages/vision/test/vision.test.ts (test patterns for vision module)
- @apps/web/app/api/vision/extract/route.ts (current route handler)
- @apps/web/components/Lab.tsx (UI where image quality warning surfaces)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement LLM Fallback Router (Groq → Claude → OpenAI)</name>
  <files>
    packages/vision/src/fallbackRouter.ts
    packages/vision/src/index.ts
    packages/vision/package.json
  </files>
  <action>
Create a new `fallbackRouter.ts` that:

1. Exports an async function `extractReceiptWithFallback(imageBuffer, mimeType)` 
2. Tries Groq first using existing `extractReceiptGroq()` 
3. On Groq error (rate limit, timeout, API key missing), falls back to Claude vision
4. On Claude error, falls back to OpenAI vision
5. Each fallback logs which provider was used (server-side console only, never expose to client)
6. Returns the receipt JSON in the same format regardless of provider (envelope: `{ provider, receipt: {...}, error?: null }`)
7. Throws an error only if all three fail

Use environment variables: `GROQ_API_KEY`, `CLAUDE_API_KEY` (via Anthropic client), `OPENAI_API_KEY`

Claude vision: Use `@anthropic-ai/sdk` (already in your monorepo? check package.json). If not, add it.
OpenAI vision: Use `openai` package (likely already present for other hackathons). If not, add it.

Groq integration is already in `groqClient.ts`; reuse its `extractReceiptGroq()` export.

Test logic (unit test only, live fallback happens in integration):
- Mock Groq to return 429 (rate limit), verify Claude is called
- Mock both Groq and Claude to fail, verify OpenAI is called
- All three fail → error bubbles up
- Success on first try → logs "provider: groq", returns receipt

Add test file: `packages/vision/test/fallbackRouter.test.ts` (10 tests, ~40 lines per test).
  </action>
  <verify>
    <automated>cd packages/vision && npm test -- --grep "fallback" 2>&1 | grep -E "(PASS|FAIL|✓|✗)" | tail -20</automated>
  </verify>
  <done>
`fallbackRouter.ts` exports `extractReceiptWithFallback()`, handles all three providers, logged locally, tested for each fallback path. No external API calls in tests (mocked).
  </done>
</task>

<task type="auto">
  <name>Task 2: Image Quality Detection (Blur + Sharpness Check)</name>
  <files>
    packages/vision/src/imageQuality.ts
    packages/vision/test/imageQuality.test.ts
  </files>
  <action>
Create `packages/vision/src/imageQuality.ts` with a single exported function:

```typescript
export async function analyzeImageQuality(imageBuffer: Buffer, mimeType: string): Promise<{
  isBlurry: boolean
  sharpnessScore: number  // 0-100, where 100 is perfectly sharp
  recommendation: 'PASS' | 'WARN_BLURRY' | 'WARN_UNDEREXPOSED'
}>
```

Implementation (no heavy ML library, just linear algebra):
1. Decode image buffer to pixel data (use `jimp` or similar if available; otherwise use `sharp` for basic image processing)
2. Convert to grayscale
3. Apply Laplacian edge detection (simple convolution kernel)
4. Calculate variance of Laplacian — high variance = sharp, low variance = blurry
5. Heuristic: if variance < 100, flag as BLURRY; if variance > 400, PASS; in between, WARN_BLURRY
6. Also check luminance histogram: if bottom quartile > 80% of pixels, flag UNDEREXPOSED
7. Return all three signals

Tests (10 tests):
- Test with known blurry receipt image (if available in test fixtures)
- Test with sharp receipt image
- Test with underexposed image
- Verify score range (0-100)
- Verify recommendation logic

Do NOT call an external API. This runs on the server before vision API call.
  </action>
  <verify>
    <automated>cd packages/vision && npm test -- --grep "imageQuality" 2>&1 | tail -15</automated>
  </verify>
  <done>
`imageQuality.ts` exports `analyzeImageQuality()`, detects blur and underexposure via Laplacian variance, returns recommendation enum, tested with 10 deterministic tests.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire Fallback Router + Quality Check into `/api/vision/extract` Route</name>
  <files>
    apps/web/app/api/vision/extract/route.ts
  </files>
  <action>
Update the existing POST `/api/vision/extract` route handler:

1. Read the multipart image upload (already done; existing code)
2. Call `analyzeImageQuality(imageBuffer, mimeType)` BEFORE vision API
3. If quality is WARN_BLURRY or WARN_UNDEREXPOSED, include `qualityWarning` in the response JSON (do not block)
4. Call `extractReceiptWithFallback(imageBuffer, mimeType)` instead of direct Groq call
5. Return response shape:
   ```json
   {
     "success": true,
     "receipt": {...},
     "qualityWarning": "WARN_BLURRY",  // or null
     "provider": "groq"  // or "claude" or "openai"
   }
   ```

If fallback router fails all three providers, return 500 with error message.

Do NOT expose which provider was used on errors — client should not reason about fallback state. (Internal logging only.)
  </action>
  <verify>
    <automated>curl -X POST http://localhost:3017/api/vision/extract -F "image=@test.jpg" 2>/dev/null | jq '.qualityWarning' 2>/dev/null || echo "Route callable"</automated>
  </verify>
  <done>
Route wires fallback + quality check, responds with provider + warning, no exposed fallback logic to client.
  </done>
</task>

<task type="auto">
  <name>Task 4: Pre-Upload Quality Warning in Lab UI</name>
  <files>
    apps/web/lib/imageOptimization.ts
    apps/web/components/Lab.tsx
  </files>
  <action>
Create `apps/web/lib/imageOptimization.ts`:

```typescript
export async function checkLocalImageQuality(file: File): Promise<{
  isBlurry: boolean
  recommendation: string  // e.g., "Image looks blurry. Try better lighting."
}>
```

Implementation (client-side, no external calls):
1. Create an Image element and load the file blob
2. Draw to a canvas
3. Run a simplified Laplacian (same heuristic as server, but client-side via Canvas API)
4. Return rough quality estimate

Update `apps/web/components/Lab.tsx`:
1. Add file input onChange handler
2. Call `checkLocalImageQuality(file)` immediately after file selection
3. If blurry, show a yellow warning banner above the upload: "📷 This image looks blurry. Better lighting or focus might help, but we'll try anyway."
4. User can dismiss and proceed, or re-select
5. When upload starts, disable the warning banner

Wire the warning into the existing Lab UI (add a `<motion.div>` with warning text).
  </action>
  <verify>
    <automated>grep -c "isBlurry\|Laplacian" apps/web/lib/imageOptimization.ts && grep -c "qualityWarning" apps/web/components/Lab.tsx</automated>
  </verify>
  <done>
Client-side pre-upload warning via Laplacian, user can dismiss and proceed. Non-blocking, helpful signal only.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client → Server (API) | Image buffer and extracted JSON cross here; untrusted input |
| Server → Groq/Claude/OpenAI | API keys sent; assume provider is trusted |
| LLM output → Engine | Receipt JSON from any provider must pass engine reconciliation before ledger |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-01-FALLBACK-KEY-LEAK | Disclosure | fallbackRouter.ts | Mitigate | Environment variables only, never log keys, Groq/Claude/OpenAI keys server-side only |
| T-01-BLUR-BYPASS | Tampering | imageQuality.ts | Accept | User can ignore blur warning and proceed; engine reconciliation catches bad OCR anyway |
| T-01-OCR-HALLUCINATION | Integrity | Any LLM provider | Mitigate | Engine re-reconciles all LLM output against sum; ledger hash makes tampering detectable |

</threat_model>

<verification>
After all tasks complete:

1. **Route test**: Upload a real receipt photo to http://localhost:3017/api/vision/extract, verify response includes `qualityWarning` and `provider` fields
2. **Fallback test** (manual): Temporarily set invalid Groq key in `.env`, verify route still works (falls back), check server logs show "provider: claude"
3. **UI test**: Upload a blurry image to Lab, verify yellow warning appears in 2-3 seconds, user can dismiss
4. **Run full test suite**: `pnpm test` must pass all 119 tests (no regressions)

</verification>

<success_criteria>
- `packages/vision/src/fallbackRouter.ts` exists and exports `extractReceiptWithFallback()`
- `/api/vision/extract` route uses fallback routing + quality check
- Lab UI shows pre-upload blur warning for low-quality images
- All 119 existing tests still pass
- Fallback logic is transparent (no client-side awareness of which provider was used)
- All three providers (Groq, Claude, OpenAI) tested in unit tests
- Server logs show provider used, but response does not leak fallback state on error

</success_criteria>

<output>
After execution completes, create `.planning/phases/01-hackathon-endgame/01-01-SUMMARY.md` with:
- What was built (fallback router, image quality detection, API wiring)
- What's now robust (Vision API calls survive rate limits, blurry receipts are warned)
- Test results summary
- Deployment status (live? staging?)
- What blocks the next wave (nothing; Wave 2 is independent)

</output>
