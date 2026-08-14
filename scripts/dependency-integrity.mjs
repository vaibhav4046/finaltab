#!/usr/bin/env node
/**
 * Undeclared-dependency gate.
 *
 * Every bare import in a workspace package must be declared by that package's
 * own package.json. This exists because pnpm hoists a virtual store and Node
 * walks up past the repository root, so an undeclared import can resolve from
 * `node_modules/.pnpm/node_modules` or from an unrelated install in a parent
 * directory and pass every local gate while failing a clean checkout. Reading
 * the manifests is deterministic; resolving the specifier is not, so this check
 * deliberately never calls `require.resolve`.
 *
 * Usage:
 *   node scripts/dependency-integrity.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directories that hold generated or installed code, never authored sources. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "artifacts",
  "cache",
  "typechain-types",
  "coverage",
  "playwright-report",
  "test-results",
]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".cjs", ".js"];

/**
 * Specifiers that are legitimately absent from every package.json.
 *
 * `server-only` and `client-only` are not real installs. Next.js ships them as
 * bundler aliases (next/dist/compiled/server-only) and the web test setup stubs
 * them, so they are unresolvable by plain Node on purpose. Declaring them would
 * add a package that nothing actually loads.
 */
const EXEMPT = new Map([
  ["server-only", "Next.js bundler alias (next/dist/compiled/server-only), stubbed in vitest.config.ts"],
  ["client-only", "Next.js bundler alias (next/dist/compiled/client-only)"],
]);

/** Node reserves the `node:` scheme; nothing can be installed under it. */
const NODE_SCHEME = /^node:/u;

/**
 * Bare builtin names, for imports written without the scheme (`import "fs"`).
 *
 * Prefix-only modules are filtered out rather than folded in, and the scheme is
 * matched by prefix rather than by lookup, because `builtinModules` is not a
 * stable answer to "is this a builtin". The modules that exist only with the
 * prefix, currently `node:test`, `node:test/reporters`, `node:sqlite` and
 * `node:sea`, are listed on Node 24 but absent on Node 22. Deriving either set
 * from those entries makes the verdict depend on the Node version that happens
 * to run the gate, which is how `node:test` was classified as a third-party
 * package on CI while passing locally: precisely the pass-here-fail-there
 * failure this gate exists to prevent.
 */
const BUILTIN = new Set(builtinModules.filter((name) => !NODE_SCHEME.test(name)));

/**
 * Matches static import/export sources, `require(...)` and dynamic `import(...)`.
 * Comment stripping is not attempted; a commented-out import of a package the
 * repository does not depend on is still worth surfacing.
 */
const SPECIFIER =
  /(?:^|[\s;{}()])(?:import|export)\s+(?:[\w*{}\s,]*?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;

function fail(message) {
  process.stderr.write(`dependency-integrity: ${message}\n`);
  process.exit(1);
}

function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

/**
 * Every manifest in the repository below the root, workspace member or not.
 * `video/finaltab-winner` is not a pnpm workspace member but carries its own
 * package.json, and its scripts are as capable of depending on a stray install
 * as anything in apps/ or packages/, so it is scanned against its own manifest
 * rather than being folded into the root scope.
 */
function findPackages() {
  const packages = [];
  const stack = [REPO_ROOT];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      const path = join(current, entry.name);
      if (existsSync(join(path, "package.json"))) packages.push(path);
      else stack.push(path);
    }
  }
  return packages;
}

function sourceFiles(dir, excludedDirs) {
  const found = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || excludedDirs.has(path)) continue;
        stack.push(path);
        continue;
      }
      // Vendored minified bundles are third-party build output, not sources.
      if (entry.name.endsWith(".min.js")) continue;
      if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) found.push(path);
    }
  }
  return found;
}

/** `@scope/name/sub` -> `@scope/name`; `name/sub` -> `name`; relative -> null. */
function packageOf(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/")) return null;
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

function declaredNames(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
}

function main() {
  const packageDirs = findPackages();
  const excludedFromRoot = new Set(packageDirs);
  const scopes = [
    { dir: REPO_ROOT, label: "<root>", excluded: excludedFromRoot },
    ...packageDirs.map((dir) => ({ dir, label: relative(REPO_ROOT, dir).replace(/\\/gu, "/"), excluded: new Set() })),
  ];

  const violations = [];
  let scanned = 0;

  for (const scope of scopes) {
    const manifest = readManifest(scope.dir);
    const declared = declaredNames(manifest);
    const files = sourceFiles(scope.dir, scope.excluded);
    scanned += files.length;

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(SPECIFIER)) {
        const specifier = match[1] ?? match[2] ?? match[3];
        if (NODE_SCHEME.test(specifier)) continue;
        const name = packageOf(specifier);
        if (name === null) continue;
        if (BUILTIN.has(name) || EXEMPT.has(name) || declared.has(name)) continue;
        if (name === manifest.name) continue;
        violations.push({
          scope: scope.label,
          name,
          file: relative(REPO_ROOT, file).replace(/\\/gu, "/"),
        });
      }
    }
  }

  if (violations.length > 0) {
    const lines = violations.map(
      ({ scope, name, file }) => `  ${file} imports "${name}", not declared by ${scope}/package.json`,
    );
    fail(`${violations.length} undeclared import(s):\n${lines.join("\n")}`);
  }

  process.stdout.write(
    `dependency-integrity: ${scanned} files across ${scopes.length} packages, every bare import declared\n`,
  );
}

if (!existsSync(join(REPO_ROOT, "pnpm-workspace.yaml"))) {
  fail("pnpm-workspace.yaml not found; run this from the repository.");
}
statSync(join(REPO_ROOT, "package.json"));
main();
