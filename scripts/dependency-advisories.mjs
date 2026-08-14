#!/usr/bin/env node
/**
 * Dependency vulnerability gate.
 *
 * This replaces actions/dependency-review-action, which cannot run here: it is a
 * front end for GitHub's Dependency-graph service, and on a repository where that
 * service is not enabled it fails with "Dependency review is not supported on this
 * repository" no matter how clean the tree is. A security gate that fails for a
 * reason unrelated to security teaches everyone to ignore it. `pnpm audit` reads
 * the same advisory data from the registry and needs nothing from the platform.
 *
 * The interesting half is the policy. A bare `pnpm audit --audit-level=high` fails
 * this repository on day one, entirely on Hardhat, Vitest and React Native build
 * tooling that never reaches the deployed application, so the gate would be
 * switched off within a week. Instead every accepted advisory is written down in
 * security/dependency-advisories.json with a justification, the exact dependency
 * path it is accepted through, and a review date. An entry is only honoured on
 * those terms:
 *
 *   - a high or critical advisory with no entry fails;
 *   - an entry whose reviewBy has passed fails, so silence has an expiry;
 *   - an entry reached through a path it does not name fails, which is what turns
 *     "this is only build tooling" from a comment into a checked claim: the day
 *     one of these packages becomes reachable from the shipped app, the path
 *     changes and the gate reopens;
 *   - an entry matching no current advisory fails, so the list cannot accumulate
 *     dead suppressions that quietly widen it.
 *
 * Usage:
 *   node scripts/dependency-advisories.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = join(REPO_ROOT, "security", "dependency-advisories.json");

/** Ordered so a floor of "high" also selects "critical". */
const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function fail(message) {
  process.stderr.write(`dependency-advisories: ${message}\n`);
  process.exit(1);
}

/**
 * `pnpm audit --json` exits non-zero whenever it finds anything, which is the
 * normal case here, so the exit code carries no signal and only unparsable
 * output counts as a failure of the command itself.
 *
 * It reads pnpm-lock.yaml rather than node_modules, so this runs in the CI
 * integrity job, which deliberately never installs. The command is a constant
 * string through a shell because on Windows pnpm is a .cmd, which Node refuses
 * to spawn directly; there is no interpolation to escape.
 */
function runAudit() {
  const result = spawnSync("pnpm audit --json", {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });

  if (result.error) fail(`could not run pnpm audit: ${result.error.message}`);

  const stdout = result.stdout ?? "";
  const start = stdout.indexOf("{");
  if (start === -1) {
    fail(`pnpm audit produced no JSON (exit ${result.status}).\n${(result.stderr ?? "").trim()}`);
  }

  try {
    return JSON.parse(stdout.slice(start));
  } catch (error) {
    fail(`could not parse pnpm audit output: ${error.message}`);
  }
}

/** Every distinct dependency path an advisory was reached through. */
function pathsOf(advisory) {
  const paths = new Set();
  for (const finding of advisory.findings ?? []) {
    for (const path of finding.paths ?? []) paths.add(path);
  }
  return paths;
}

function main() {
  if (!existsSync(POLICY_PATH)) fail(`policy file not found at security/dependency-advisories.json`);
  const policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));

  const floor = SEVERITY_RANK[policy.severityFloor];
  if (floor === undefined) fail(`policy severityFloor "${policy.severityFloor}" is not a known severity`);

  const accepted = new Map();
  for (const entry of policy.accepted ?? []) {
    if (accepted.has(entry.id)) fail(`policy lists ${entry.id} twice`);
    for (const field of ["module", "severity", "reachability", "justification", "reviewBy"]) {
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        fail(`policy entry ${entry.id} is missing "${field}"`);
      }
    }
    if (!Array.isArray(entry.paths) || entry.paths.length === 0) {
      fail(`policy entry ${entry.id} must name at least one dependency path`);
    }
    accepted.set(entry.id, entry);
  }

  const report = runAudit();
  const advisories = Object.values(report.advisories ?? {});

  const unlisted = [];
  const wrongPath = [];
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();

  for (const advisory of advisories) {
    if ((SEVERITY_RANK[advisory.severity] ?? 0) < floor) continue;
    const id = advisory.github_advisory_id;
    const entry = accepted.get(id);

    if (entry === undefined) {
      unlisted.push(
        `  ${advisory.severity.toUpperCase()} ${id} ${advisory.module_name}` +
          ` (patched ${advisory.patched_versions})\n` +
          [...pathsOf(advisory)].map((path) => `      via ${path}`).join("\n"),
      );
      continue;
    }

    seen.add(id);
    const permitted = new Set(entry.paths);
    for (const path of pathsOf(advisory)) {
      if (!permitted.has(path)) wrongPath.push(`  ${id} (${advisory.module_name}) now reached via\n      ${path}`);
    }
  }

  const expired = [...accepted.values()]
    .filter((entry) => entry.reviewBy < today)
    .map((entry) => `  ${entry.id} (${entry.module}) was due for review on ${entry.reviewBy}`);

  const stale = [...accepted.keys()]
    .filter((id) => !seen.has(id))
    .map((id) => `  ${id} (${accepted.get(id).module}) no longer appears in the audit`);

  const problems = [];
  if (unlisted.length > 0) {
    problems.push(`${unlisted.length} advisory(ies) at or above ${policy.severityFloor} with no policy entry:\n${unlisted.join("\n")}`);
  }
  if (wrongPath.length > 0) {
    problems.push(
      `${wrongPath.length} accepted advisory(ies) reached through an unreviewed path.\n` +
        `The acceptance was argued from where the package sits in the tree, so a new path voids it:\n${wrongPath.join("\n")}`,
    );
  }
  if (expired.length > 0) {
    problems.push(`${expired.length} policy entry(ies) past their review date:\n${expired.join("\n")}`);
  }
  if (stale.length > 0) {
    problems.push(
      `${stale.length} policy entry(ies) match nothing and must be deleted:\n${stale.join("\n")}`,
    );
  }

  if (problems.length > 0) fail(problems.join("\n\n"));

  const counts = report.metadata?.vulnerabilities ?? {};
  process.stdout.write(
    `dependency-advisories: no unreviewed advisory at or above ${policy.severityFloor}. ` +
      `${accepted.size} accepted, each pinned to its dependency path and due for review by ` +
      `${[...accepted.values()].map((entry) => entry.reviewBy).sort()[0]}. ` +
      `Audit totals: ${Object.entries(counts)
        .map(([severity, count]) => `${count} ${severity}`)
        .join(", ")}.\n`,
  );
}

main();
