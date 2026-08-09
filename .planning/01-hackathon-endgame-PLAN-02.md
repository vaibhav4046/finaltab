---
phase: 01-hackathon-endgame
plan: 02
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - apps/web/components/AppShell.tsx
  - apps/web/app/globals.css
  - apps/web/app/app/layout.tsx
  - packages/keeperhub-flight-recorder/bin/kh-proof.mjs
  - packages/keeperhub-flight-recorder/src/cli.ts

autonomous: true
requirements:
  - HACKATHON-MOBILE-POLISH
  - HACKATHON-CLI-EXPANSION
  - USER-EXPERIENCE-RESPONSIVE

must_haves:
  truths:
    - "User on 390px phone can see all content without horizontal scroll"
    - "Bottom nav is sticky and shows current page indicator"
    - "CLI command `finaltab settle` shows available settlements from device history"
    - "CLI command `finaltab proof SETTLEMENT_ID` polls KeeperHub status"
  artifacts:
    - path: "apps/web/components/BottomNav.tsx"
      provides: "Mobile bottom navigation bar, sticky, shows 4+ main routes"
      min_lines: 60
    - path: "apps/web/app/globals.css"
      provides: "Mobile-first Tailwind responsive tweaks for 390px+"
      exports: ["@media (max-width: 640px)", "padding-bottom: 80px"]
    - path: "packages/keeperhub-flight-recorder/src/cli.ts"
      provides: "New CLI commands: settle, proof, history"
      exports: ["command('settle')", "command('proof')"]
  key_links:
    - from: "apps/web/components/BottomNav.tsx"
      to: "apps/web/app/app/layout.tsx"
      via: "sticky footer rendering in AppShell"
    - from: "apps/web/app/globals.css"
      to: "Tailwind responsive breakpoints"
      via: "@media queries for 390px mobile"
    - from: "packages/keeperhub-flight-recorder/src/cli.ts"
      to: "packages/keeperhub/src/client.ts"
      via: "settlement lookup + KeeperHub API polling"

---

<objective>
Polish mobile UX + expand CLI to make FINALTab more accessible for integration and demo video.

Purpose: Bottom nav makes mobile feel native. CLI tools let power users settle + verify without the web UI.

Output:
- `apps/web/components/BottomNav.tsx` — sticky mobile nav
- Mobile responsive CSS updates (390px+ viewport handling)
- CLI expansion: `finaltab settle`, `finaltab proof`, `finaltab history`
- All routes work on 390px devices with bottom nav visible
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md

Wave 2 runs in parallel with Wave 1. No dependency on fallback routing; just mobile UX polish + CLI.
</execution_context>

<context>
@apps/web/components/Lab.tsx (current mobile responsive state)
@apps/web/components/AuthPanel.tsx (mobile sizing reference)
@packages/keeperhub-flight-recorder/bin/kh-proof.mjs (existing CLI entry point)
@packages/identity/src/index.ts (device-local history access)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Mobile Bottom Navigation Component</name>
  <files>
    apps/web/components/BottomNav.tsx
    apps/web/components/AppShell.tsx
    apps/web/app/app/layout.tsx
  </files>
  <action>
Create `apps/web/components/BottomNav.tsx`:

```typescript
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, FileText, Settings, HelpCircle } from "lucide-react"

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Home", icon: <Home size={24} /> },
  { href: "/app/tab", label: "Settle", icon: <FileText size={24} /> },
  { href: "/app/proof", label: "Proof", icon: <HelpCircle size={24} /> },
  { href: "/auth", label: "Profile", icon: <Settings size={24} /> },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-edge bg-panel md:hidden">
      <div className="flex h-20 items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2 px-3 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                isActive ? "text-coral" : "text-fog hover:text-paper"
              }`}
            >
              <span className={isActive ? "text-coral" : "text-fog"}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

Key points:
- Hidden on `md:` (768px+) and above (desktop gets top nav)
- Fixed bottom, full width
- Shows active route in coral color
- 4 main destinations: Home, Settle, Proof, Profile
- Icon + label per item

Create/update `apps/web/components/AppShell.tsx` to wrap the app and include `<BottomNav />`:

```typescript
"use client"

import { BottomNav } from "./BottomNav"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {children}
      <BottomNav />
    </div>
  )
}
```

Update `apps/web/app/app/layout.tsx` to use AppShell:

```typescript
import { AppShell } from "@/components/AppShell"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
```
  </action>
  <verify>
    <automated>grep -c "BottomNav\|bottom-0\|md:hidden" apps/web/components/BottomNav.tsx && grep "import.*AppShell" apps/web/app/app/layout.tsx</automated>
  </verify>
  <done>
BottomNav component renders 4 nav items, is sticky/fixed at bottom, hidden on desktop, shows active route indicator.
  </done>
</task>

<task type="auto">
  <name>Task 2: Mobile Responsive CSS + Viewport Adjustments</name>
  <files>
    apps/web/app/globals.css
    apps/web/components/Lab.tsx
    apps/web/components/SplitPanel.tsx
  </files>
  <action>
Update `apps/web/app/globals.css` to add mobile-first responsive rules:

1. Add padding-bottom to main content areas on mobile to account for fixed bottom nav:
   ```css
   @media (max-width: 767px) {
     main {
       padding-bottom: 6rem; /* 80px for bottom nav */
     }
     body {
       margin-bottom: 0;
     }
   }
   ```

2. Ensure all form inputs and buttons are touch-friendly (min 44x44px) on mobile:
   ```css
   @media (max-width: 640px) {
     button, input[type="button"], input[type="submit"] {
       min-height: 2.75rem;
       min-width: 2.75rem;
     }
   }
   ```

3. Stack flex layouts on 390px:
   ```css
   @media (max-width: 480px) {
     .flex-row-md-up {
       @apply flex-col;
     }
   }
   ```

4. Reduce padding/margins on mobile (half on 390px, full on 768px+):
   ```css
   @media (max-width: 640px) {
     .px-6 { @apply px-3; }
     .py-10 { @apply py-5; }
   }
   ```

Test widths:
- 390px (iPhone SE / small Android)
- 480px (iPhone 6/7/8)
- 640px (small tablet, iPad mini)
- 768px+ (desktop)

Review existing components (Lab.tsx, SplitPanel.tsx) and verify they don't break at 390px. Update className flex/grid logic if needed (e.g., `grid-cols-2` → `grid-cols-1 md:grid-cols-2`).
  </action>
  <verify>
    <automated>grep -c "max-width: 640px\|md:hidden\|padding-bottom" apps/web/app/globals.css && echo "Responsive CSS added"</automated>
  </verify>
  <done>
Mobile viewport accounts for bottom nav, all interactive elements are touch-friendly (44x44px min), layouts stack appropriately at 390px.
  </done>
</task>

<task type="auto">
  <name>Task 3: CLI Expansion (settle, proof, history Commands)</name>
  <files>
    packages/keeperhub-flight-recorder/src/cli.ts
    packages/keeperhub-flight-recorder/bin/kh-proof.mjs
  </files>
  <action>
Expand the CLI (existing `kh-proof` command) to add three new commands:

1. **`finaltab settle`** — list all device-local settlements from history
   - Reads from localStorage (via device-local identity module)
   - Shows: settlement ID, merchant, amount, verdict, created date
   - Format: compact table (ASCII) suitable for terminal
   - No API calls

2. **`finaltab proof <SETTLEMENT_ID>`** — given a settlement ID, poll KeeperHub status
   - Looks up settlement in device-local history
   - If not found: "Settlement not found. Run `finaltab settle` to see options."
   - If found, call KeeperHub status API (same polling logic as web UI)
   - Show: executionId, status, chain receipt link (if verified)
   - Exit code: 0 if VERIFIED_SETTLED, 1 if FAILED, 2 if PENDING, 3 if unknown

3. **`finaltab history`** — alias for settle; show all settlements

Update entry point `packages/keeperhub-flight-recorder/bin/kh-proof.mjs`:

```bash
#!/usr/bin/env node

import { program } from "commander"
import { listSettlements, pollSettlement } from "../src/cli.ts"

program
  .name("finaltab")
  .description("FINALTab CLI: settle, verify, inspect")

program
  .command("settle")
  .description("List all device-local settlements")
  .action(async () => {
    await listSettlements()
  })

program
  .command("proof <settlementId>")
  .description("Poll a settlement's KeeperHub status")
  .action(async (id) => {
    await pollSettlement(id)
  })

program
  .command("history")
  .description("Alias for settle")
  .action(async () => {
    await listSettlements()
  })

program.parse(process.argv)
```

Implement in `packages/keeperhub-flight-recorder/src/cli.ts`:
- `listSettlements()`: loads from device-local history, formats as table, prints
- `pollSettlement(id)`: looks up in history, polls KeeperHub, prints status

Note: CLI runs in Node.js context, so it cannot directly access browser localStorage. Instead:
- CLI accepts settlement data via stdin or config file, OR
- CLI takes a `--device-id` flag and reads a local JSON file simulating device state (for demo only)

For MVP: just format the output. Accept a JSON file path argument: `finaltab proof <settlementId> --data-file ./settlement-data.json`

Add 3 tests: list command, proof success, proof not found.
  </action>
  <verify>
    <automated>cd packages/keeperhub-flight-recorder && npm run build 2>&1 | tail -5 && ./bin/kh-proof.mjs settle --help 2>/dev/null | head -3</automated>
  </verify>
  <done>
CLI supports `settle`, `proof <id>`, `history` commands. Tests cover happy path + not-found case. Help text is present.
  </done>
</task>

<task type="auto">
  <name>Task 4: PWA Service Worker Verification + Manifest Polish</name>
  <files>
    apps/web/public/manifest.webmanifest
    apps/web/public/sw.js
    apps/web/app/layout.tsx
  </files>
  <action>
Check if PWA service worker exists:
- If `apps/web/public/sw.js` exists: verify it caches static assets and API responses appropriately
- If missing: create a minimal service worker that caches the app shell and lets dynamic requests hit the network

Update `apps/web/public/manifest.webmanifest`:

```json
{
  "name": "FINALTab — settled in one go",
  "short_name": "FINALTab",
  "description": "AI receipt splitting + verified onchain settlement on Base",
  "start_url": "/app",
  "display": "standalone",
  "scope": "/",
  "theme_color": "#121110",
  "background_color": "#121110",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "192x192 512x512",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ]
}
```

Verify in `apps/web/app/layout.tsx` that manifest is linked:
```typescript
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  ...
}
```

Test on mobile:
- Can add to home screen?
- Does it launch in standalone mode (no address bar)?

Note: Full offline support (background sync, etc.) is not required for the video. Just make sure the app can launch standalone.
  </action>
  <verify>
    <automated>[ -f apps/web/public/manifest.webmanifest ] && grep -q "start_url" apps/web/public/manifest.webmanifest && echo "Manifest valid" || echo "Manifest missing"</automated>
  </verify>
  <done>
PWA manifest is complete, service worker (if needed) caches appropriately, app can launch standalone on mobile.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Device-local history → CLI | History data read from localStorage or file; assumed local/trusted |
| CLI → KeeperHub API | Execution status queries; assume API is trusted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-02-CLI-SPOOF | Spoofing | cli.ts (proof command) | Mitigate | Settlement ID is immutable; KeeperHub API confirms chain receipt |
| T-02-MOBILE-CACHE-STALE | Information Disclosure | Service worker | Accept | Cached assets are public; no secrets in cache; stale data is low-risk for read-only operations |

</threat_model>

<verification>
After all tasks complete:

1. **Mobile test**: Open https://finaltab.vercel.app on a 390px device (iPhone SE or Chrome dev tools), verify bottom nav is visible and sticky
2. **Bottom nav active state**: Click each nav item, verify the icon/label changes to coral color
3. **Responsive test**: Resize to 480px, 640px, 768px; ensure layouts adjust and nothing breaks
4. **CLI test**: Run `pnpm -r --if-present test` in keeperhub-flight-recorder, verify settle/proof/history commands run without error
5. **PWA test**: Open DevTools, go to Application tab, verify manifest.webmanifest is listed and start_url is "/app"
6. **Full test suite**: `pnpm test` must pass all tests (no regressions)

</verification>

<success_criteria>
- BottomNav component exists and is visible on mobile (<768px), hidden on desktop
- Active nav item is highlighted in coral
- All form inputs and buttons meet 44x44px minimum on mobile
- 390px viewport does not cause horizontal scroll
- `finaltab settle`, `finaltab proof`, `finaltab history` commands exist and are callable
- Manifest is valid and linked in layout metadata
- All 119 existing tests still pass

</success_criteria>

<output>
After execution completes, create `.planning/phases/01-hackathon-endgame/01-02-SUMMARY.md` with:
- Mobile responsive breakpoints implemented
- CLI commands added + test coverage
- PWA readiness verified
- What's now mobile-friendly (390px+, bottom nav, touch-friendly)
- Deployment status (live on Vercel? staging?)

</output>
