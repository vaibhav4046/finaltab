#!/usr/bin/env node
/**
 * Per-route client bundle budget.
 *
 * Reads the App Router build manifest and sums the on-disk bytes of every
 * client chunk a route loads eagerly, then compares that against a committed
 * baseline. Next's human-readable build table is deliberately not parsed: its
 * format changes between minor releases, so a check built on it fails for
 * reasons that have nothing to do with the bundle.
 *
 * Usage:
 *   node scripts/bundle-budget.mjs            verify against the baseline
 *   node scripts/bundle-budget.mjs --update   rewrite the baseline from this build
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_DIR = join(REPO_ROOT, "apps", "web", ".next");
const MANIFEST = join(NEXT_DIR, "app-build-manifest.json");
const BASELINE = join(REPO_ROOT, "apps", "web", "bundle-budget.json");

/** Headroom over the recorded size before a route is called a regression. */
const TOLERANCE = 0.03;

function fail(message) {
  process.stderr.write(`bundle-budget: ${message}\n`);
  process.exit(1);
}

function measure() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch (cause) {
    fail(`could not read ${MANIFEST}. Run \`pnpm build\` first. (${cause.message})`);
  }

  const routes = {};
  for (const [page, files] of Object.entries(manifest.pages ?? {})) {
    // Only page entries are what a browser actually downloads. Route handlers
    // never reach the client, and layout/loading/error entries are subsets of
    // the page entry that nests them, so budgeting them double-counts.
    if (!page.endsWith("/page")) continue;

    let bytes = 0;
    for (const file of files) {
      // Only client JavaScript counts toward the first-load budget.
      if (!file.endsWith(".js")) continue;
      try {
        bytes += statSync(join(NEXT_DIR, file)).size;
      } catch (cause) {
        fail(`manifest references a missing asset: ${file} (${cause.message})`);
      }
    }
    routes[page] = bytes;
  }

  if (Object.keys(routes).length === 0) fail("build manifest contained no routes");
  return routes;
}

const measured = measure();

if (process.argv.includes("--update")) {
  const ordered = Object.fromEntries(Object.keys(measured).sort().map((key) => [key, measured[key]]));
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ tolerance: TOLERANCE, routes: ordered }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`bundle-budget: wrote ${Object.keys(ordered).length} routes to ${BASELINE}\n`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch (cause) {
  fail(`could not read the baseline at ${BASELINE}. (${cause.message})`);
}

const recorded = baseline.routes ?? {};
const tolerance = typeof baseline.tolerance === "number" ? baseline.tolerance : TOLERANCE;
const regressions = [];
const unbudgeted = [];
const removed = [];
const improvements = [];

for (const [page, bytes] of Object.entries(measured)) {
  // A new route with no recorded size is a gap in the budget, not a pass.
  if (!(page in recorded)) {
    unbudgeted.push({ page, bytes });
    continue;
  }
  const limit = Math.round(recorded[page] * (1 + tolerance));
  if (bytes > limit) regressions.push({ page, bytes, recorded: recorded[page], limit });
  else if (bytes < recorded[page]) improvements.push({ page, bytes, recorded: recorded[page] });
}

for (const page of Object.keys(recorded)) {
  if (!(page in measured)) removed.push(page);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

for (const { page, bytes, recorded: was } of improvements) {
  process.stdout.write(`bundle-budget: ${page} improved ${kb(was)} -> ${kb(bytes)}\n`);
}

if (removed.length > 0) {
  process.stdout.write(`bundle-budget: routes in the baseline but not in this build: ${removed.join(", ")}\n`);
}

if (unbudgeted.length > 0) {
  for (const { page, bytes } of unbudgeted) {
    process.stderr.write(`bundle-budget: ${page} has no recorded budget (${kb(bytes)})\n`);
  }
  fail("run `node scripts/bundle-budget.mjs --update` and commit the baseline for the new routes");
}

if (regressions.length > 0) {
  for (const { page, bytes, recorded: was, limit } of regressions) {
    process.stderr.write(
      `bundle-budget: ${page} grew ${kb(was)} -> ${kb(bytes)}, over the ${kb(limit)} limit\n`,
    );
  }
  fail(`${regressions.length} route(s) exceeded the first-load budget`);
}

process.stdout.write(
  `bundle-budget: ${Object.keys(measured).length} routes within budget (tolerance ${(tolerance * 100).toFixed(0)}%)\n`,
);
