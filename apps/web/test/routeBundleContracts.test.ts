import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function filesUnder(root: string, extension: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return filesUnder(path, extension);
    return entry.name.endsWith(extension) ? [path] : [];
  });
}

function pageRoute(pageFile: string): string {
  const directory = relative(join(WEB_ROOT, "app"), dirname(pageFile));
  const segments = directory === "" ? [] : directory.split(sep).filter((segment) => !/^\(.+\)$/.test(segment));
  return `/${segments.join("/")}`;
}

function routeMatches(target: string, route: string): boolean {
  const targetSegments = target.split("/").filter(Boolean);
  const routeSegments = route.split("/").filter(Boolean);
  if (targetSegments.length !== routeSegments.length) return false;
  return routeSegments.every((segment, index) => segment.startsWith("[") || segment === targetSegments[index]);
}

describe("route and bundle contracts", () => {
  it("keeps every literal internal navigation target backed by an App Router page", () => {
    const pages = filesUnder(join(WEB_ROOT, "app"), "page.tsx").map(pageRoute);
    const sources = [
      ...filesUnder(join(WEB_ROOT, "app"), ".tsx"),
      ...filesUnder(join(WEB_ROOT, "components"), ".tsx"),
    ];
    const targets = new Set<string>();

    for (const sourceFile of sources) {
      const source = readFileSync(sourceFile, "utf8");
      for (const match of source.matchAll(/\bhref\s*=\s*["'](\/[^"'?#]*)/g)) {
        targets.add(match[1].replace(/\/$/, "") || "/");
      }
    }

    expect([...targets].sort()).not.toHaveLength(0);
    for (const target of targets) {
      expect(pages.some((route) => routeMatches(target, route)), `Missing page for ${target}`).toBe(true);
    }
  });

  it("keeps the public landing route out of the Framer Motion client bundle", () => {
    const landing = readFileSync(join(WEB_ROOT, "components", "Landing.tsx"), "utf8");

    expect(landing).not.toContain("framer-motion");
    expect(landing).not.toMatch(/\bmotion\./);
    expect(landing).not.toContain("useReducedMotion");
    expect(landing).toContain('fetch("/api/health"');
    expect(landing).not.toContain("Groq receipt vision");
    expect(landing).not.toMatch(/status:\s*["']Live["']/);
  });

  it("keeps the product runtime on the shared CSS motion system", () => {
    const runtimeSources = [
      ...filesUnder(join(WEB_ROOT, "app"), ".tsx"),
      ...filesUnder(join(WEB_ROOT, "components"), ".tsx"),
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    const webPackage = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(runtimeSources).not.toContain("framer-motion");
    expect(webPackage.dependencies?.["framer-motion"]).toBeUndefined();
    expect(runtimeSources).toContain("entry-rise");
    expect(runtimeSources).toContain("stage-swap");
  });

  it("keeps the Supabase browser SDK out of first-load JS", () => {
    // Every browser caller reaches the SDK from a click handler or a mount
    // effect, so a static import only has the effect of putting the whole
    // client — including the realtime transport this application never opens —
    // into the first load of every page that renders a sign-in form.
    const clientFactory = readFileSync(join(WEB_ROOT, "lib", "supabase", "client.ts"), "utf8");

    expect(clientFactory).toContain('await import("@supabase/ssr")');
    expect(clientFactory).toContain("appendPkceFlowIdToRedirects: true");
    expect(clientFactory).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+["']@supabase\//m);

    const clientSources = [
      ...filesUnder(join(WEB_ROOT, "app"), ".tsx"),
      ...filesUnder(join(WEB_ROOT, "components"), ".tsx"),
      join(WEB_ROOT, "lib", "supabase", "client.ts"),
    ];

    for (const sourceFile of clientSources) {
      const source = readFileSync(sourceFile, "utf8");
      const staticValueImport = source.match(/^import\s+(?!type\b)[^;]*from\s+["']@supabase\/[^"']+["']/m);
      expect(staticValueImport?.[0], `Static @supabase import in ${relative(WEB_ROOT, sourceFile)}`).toBeUndefined();
    }
  });

  it("keeps the root and Vercel development commands wired to the web workspace", () => {
    const rootPackage = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const webPackage = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const vercel = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8")) as {
      devCommand?: string;
    };

    expect(rootPackage.scripts?.dev).toBe("pnpm --filter @finaltab/web dev");
    expect(vercel.devCommand).toBe(rootPackage.scripts?.dev);
    expect(webPackage.scripts?.dev).toMatch(/^next dev\b/);
  });
});
