#!/usr/bin/env node
/**
 * Broken-reference gate for tracked documentation.
 *
 * Every local image, media file and relative link in a tracked markdown file
 * must resolve to a path that is itself tracked. Presence on disk is not the
 * test: a screenshot that exists locally but is ignored by .gitignore renders
 * as a broken image for everyone reading the repository on GitHub, which is
 * the failure this gate exists to prevent. `git ls-files` is therefore the
 * source of truth, because it describes exactly what a clean clone contains.
 *
 * The web manifest is deliberately out of scope. apps/web/test/
 * productionSurface.test.ts already asserts the icon list, the PNG magic
 * bytes, the real pixel dimensions and the alpha channel of every installed
 * icon, so re-checking existence here would only create two places to drift.
 *
 * Usage:
 *   node scripts/asset-integrity.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Schemes and shapes that never point at a file in this repository.
 *
 * A leading `/` is skipped rather than resolved from the repository root.
 * GitHub renders it as a site-root URL, not a repository path, and the
 * product documentation legitimately writes routes such as `/app` and
 * `/api/mcp` in link position. Treating those as missing files would make
 * the gate lie about real prose.
 */
const SKIP = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/iu;

/** Markdown images and links: `![alt](target "title")`, `[text](<target>)`. */
const INLINE = /!?\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+["'][^"']*["'])?\s*\)/gu;
/** Reference definitions: `[label]: target "title"`. */
const DEFINITION = /^\[[^\]]+\]:\s*<?([^\s>]+)>?/gmu;
/** Inline HTML in markdown: `<img src="…">`, `<a href="…">`. */
const ATTRIBUTE = /(?:src|href)\s*=\s*["']([^"']+)["']/gu;

function fail(message) {
  process.stderr.write(`asset-integrity: ${message}\n`);
  process.exit(1);
}

/**
 * Fenced blocks and inline code spans hold example commands, sample output and
 * illustrative paths that are not claims about this repository's contents, so
 * they are removed before any reference is extracted. Without this, prose such
 * as `data-composition-src="compositions/file.html"` reads as a real broken
 * asset. The inline pass is deliberately line-bounded and lazy: an unbalanced
 * backtick can only ever cause the gate to check less, never to invent a
 * reference that the document does not make.
 */
function stripCode(source) {
  return source
    .replace(/^(\s*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gmu, "")
    .replace(/(`+)[^\n]*?\1/gu, "");
}

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return output.split("\0").filter((line) => line.length > 0);
}

function references(source) {
  const found = [];
  const body = stripCode(source);
  for (const pattern of [INLINE, DEFINITION, ATTRIBUTE]) {
    for (const match of body.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** `docs/x.md#anchor?v=1` -> `docs/x.md`; unresolvable or external -> null. */
function targetPath(reference, fromDir) {
  if (SKIP.test(reference)) return null;
  const bare = reference.split("#")[0].split("?")[0];
  if (bare.length === 0) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    // A reference that is not valid percent-encoding is used verbatim; the
    // existence check below still reports it honestly if nothing matches.
    decoded = bare;
  }
  const absolute = resolve(REPO_ROOT, fromDir, decoded);
  const rooted = relative(REPO_ROOT, absolute).split(/[\\/]/u).join(posix.sep);
  // A reference that climbs out of the repository cannot be tracked by it.
  return rooted.startsWith("..") ? null : rooted;
}

function main() {
  const tracked = trackedFiles();
  const trackedSet = new Set(tracked);
  const trackedDirs = new Set();
  for (const file of tracked) {
    const segments = file.split(posix.sep);
    for (let index = 1; index < segments.length; index += 1) {
      trackedDirs.add(segments.slice(0, index).join(posix.sep));
    }
  }

  const markdown = tracked.filter((file) => file.toLowerCase().endsWith(".md"));
  const broken = [];
  let checked = 0;

  for (const file of markdown) {
    const source = readFileSync(join(REPO_ROOT, file), "utf8");
    const fromDir = posix.dirname(file);
    for (const reference of references(source)) {
      const target = targetPath(reference, fromDir === "." ? "" : fromDir);
      if (target === null) continue;
      checked += 1;
      if (trackedSet.has(target) || trackedDirs.has(target)) continue;
      broken.push({ file, reference, target });
    }
  }

  if (broken.length > 0) {
    const lines = broken.map(
      ({ file, reference, target }) => `  ${file} references "${reference}" -> ${target} is not tracked`,
    );
    fail(`${broken.length} broken reference(s):\n${lines.join("\n")}`);
  }

  process.stdout.write(
    `asset-integrity: ${checked} local references across ${markdown.length} tracked markdown files all resolve to tracked paths\n`,
  );
}

main();
