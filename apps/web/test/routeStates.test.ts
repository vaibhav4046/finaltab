import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

function source(path: string): string {
  return readFileSync(join(WEB_ROOT, path), "utf8");
}

const ROUTE_STATES = [
  "app/not-found.tsx",
  "app/error.tsx",
  "app/loading.tsx",
  "app/global-error.tsx",
  "app/app/not-found.tsx",
  "app/app/error.tsx",
  "app/app/loading.tsx",
] as const;

describe("branded route-state contract", () => {
  it("uses one guarded ledger component across public and workspace boundaries", () => {
    for (const file of ROUTE_STATES) {
      const boundary = source(file);
      expect(boundary, file).toContain("RouteStatePanel");
      expect(boundary, file).toContain('note="');
      expect(boundary, file).not.toContain("bg-gradient");
      expect(boundary, file).not.toContain("rounded-2xl");
    }

    expect(source("app/global-error.tsx")).toMatch(/<html lang="en"[^>]*>[\s\S]*<body/);
    expect(source("app/global-error.tsx")).toContain("GeistSans.variable");
    expect(source("app/global-error.tsx")).toContain("GeistMono.variable");
    expect(source("app/error.tsx")).toMatch(/^"use client";/);
    expect(source("app/app/error.tsx")).toMatch(/^"use client";/);
    expect(source("app/global-error.tsx")).toMatch(/^"use client";/);
  });

  it("announces failures and loading without exposing exception text", () => {
    const panel = source("components/RouteStatePanel.tsx");
    const failures = [
      source("app/error.tsx"),
      source("app/global-error.tsx"),
      source("app/app/error.tsx"),
    ].join("\n");

    expect(panel).toContain('role={tone === "error" ? "alert"');
    expect(panel).toContain('tone === "loading" ? "status"');
    expect(panel).toContain('aria-live={tone === "error" ? "assertive"');
    expect(panel).toContain('aria-busy={tone === "loading" ? true');
    expect(panel).toContain('aria-labelledby={titleId}');
    expect(panel).toContain('className="route-state-checkpoints" aria-hidden="true"');
    expect(failures).not.toMatch(/error\.(?:message|stack|cause|digest)/);
  });

  it("keeps route-state styling solid, responsive, and reduced-motion safe", () => {
    const globals = source("app/globals.css");
    const marker = "/* Branded route states: a guarded settlement rail, not a generic status card. */";
    const routeStateCss = globals.slice(globals.indexOf(marker));

    expect(routeStateCss).toContain(".route-state-checkpoints");
    expect(routeStateCss).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(routeStateCss).toContain("@media (max-width: 32rem)");
    expect(routeStateCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
    expect(routeStateCss).not.toContain("gradient(");
  });
});
