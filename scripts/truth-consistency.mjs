#!/usr/bin/env node
/**
 * Release-truth gate.
 *
 * This repository's documented claims have drifted from the code before, and a
 * judge reading a stale number cannot tell the difference between a typo and a
 * lie. Four classes of claim are checked, chosen because each one has actually
 * gone stale here:
 *
 *   1. The MCP tool count. Derived from the production route, so the docs are
 *      compared against the code rather than against a hard-coded number.
 *   2. The historical V1 contract address. It has no V2 authority, and naming
 *      it without saying so invites a reader to check the wrong contract.
 *   3. Test totals. These are not checked for accuracy, because forcing every
 *      count to be current would break CI on every legitimately added test.
 *      They are checked for attribution: a total must say when it was measured
 *      or admit that it is historical.
 *   4. The live V2 settlement contract address. Checking that V1 is disclaimed
 *      says nothing about whether the address presented as current is right:
 *      a wrong V2 address in the docs passed this gate silently until it was
 *      tested for. The address is also written out in three places, so the
 *      same check covers the code, where nothing previously tied the landing
 *      page's copy to the server's.
 *
 * Only tracked files are read, because only tracked files exist in a clone.
 * Fenced blocks are exempt throughout: they hold verbatim captured output, and
 * rewriting recorded evidence to satisfy a linter would be the actual
 * dishonesty this gate exists to prevent.
 *
 * Usage:
 *   node scripts/truth-consistency.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const MCP_ROUTE = "apps/web/app/api/mcp/route.ts";
const V1_ADDRESS = "0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64";

/** The one place the live contract is declared; every other copy is checked against it. */
const CONTRACT_MODULE = "apps/web/lib/server/health.ts";
const CONTRACT_EXPORT = /export const VERIFIED_V2_CONTRACT\s*=\s*"(0x[0-9a-fA-F]{40})"/u;

const ADDRESS = /0x[0-9a-fA-F]{40}\b/gu;

/**
 * An address bound to a settlement-contract-shaped name. Anchoring on the name
 * rather than on the 40-byte shape is what keeps the USDC token address, the
 * deployer and the participant wallets out of the check: those are addresses
 * too, and demanding they equal the settlement contract would be nonsense.
 */
const CONTRACT_BINDING = /\b\w*contract\w*\b\s*[:=]\s*"?(0x[0-9a-fA-F]{40})\b/giu;

/**
 * Prose asserting which contract is live. Same reasoning as CONTRACT_BINDING:
 * an address only has to match when the surrounding sentence says it is the
 * settlement contract, so evidence files listing a counterparty wallet beside a
 * proof are untouched.
 */
const CONTRACT_CLAIM =
  /\b(?:settlement\s+contract|FinalTabBatchSettlementV2|V2\s+contract|contract\s+address|NEXT_PUBLIC_SETTLEMENT_CONTRACT)\b/iu;

/**
 * How far back to look for a bare "contract" introducing an address.
 *
 * CONTRACT_CLAIM is line-scoped, which misses the wrapped case: `docs/blockers.md`
 * ends one line with "resolved: contract" and starts the next with the address,
 * and that sentence went stale-proof for exactly that reason. Widening the claim
 * test to the whole unit was tried and rejected — it flagged the deployer wallet
 * in the blast-radius paragraph, whose unit says "deployed the settlement
 * contract" three lines later. A word that TRAILS an address does not name it.
 * So the bare word only counts when it sits immediately before the address,
 * across at most one line break.
 */
const CONTRACT_LEAD_WINDOW = 60;
const CONTRACT_LEAD = /\bcontract\b/iu;

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty",
];

/** A count immediately qualifying "tools", written as a word or a digit. */
const TOOL_CLAIM = new RegExp(String.raw`\b(${NUMBER_WORDS.join("|")}|\d+)[\s-]+(?:MCP\s+)?tools\b`, "giu");

/**
 * Markers that the surrounding text is not asserting the current surface.
 * Naming the superseded contract or the retired seven-tool interface is fine;
 * naming either without saying so is not. `do not show` earns its place here:
 * the capture storyboard tells the operator not to present the old tool list,
 * which is the opposite of claiming it.
 */
const NOT_CURRENT =
  /\b(?:v1|historical|history|legacy|retired|archived?|superseded|previous(?:ly)?|former|old|predates|then-measured|no longer|not the current|do not show)\b/iu;

/**
 * Aggregate suite totals: "212 passed", "11/11 tests", "27 tests passing",
 * "212 tests, 1 skipped". Deliberately not per-sentence counts such as
 * "12 tests driving the router", which describe a file rather than assert the
 * state of the suite.
 */
const TEST_TOTAL = /\b\d+\s*\/\s*\d+\s+tests?\b|\b\d+\s+tests?\s+passing\b|\b\d+\s+(?:passed|passing)\b|\b\d+\s+tests?,\s*\d+\s+skipped\b/iu;

/** A total is honest if it says when it was true, or that it no longer is. */
const DATED = /\b\d{4}-\d{2}-\d{2}\b/u;
const BASELINE = /\bbaseline\b/iu;

/**
 * Text that names a number in order to disown it. `decisions.md` records every
 * rejected alternative beside the chosen one, including "mocking it so the
 * suite reads a round 155 passing" — a total the project deliberately refused
 * to publish. Flagging that as an unattributed claim would invert the gate:
 * the sentence exists precisely because the number was never asserted.
 */
const NOT_ASSERTED = /\b(?:rejected|hypothetical|instead of|rather than|would (?:read|have|be))\b/iu;

/**
 * Documents that declare themselves archives in their own title.
 *
 * Attribution is allowed to be document-level. `docs/release/gates.md` is
 * titled "Historical V1 release gates" and says outright that it preserves the
 * 2026-08-10 run "including its old contract address, test counts, and video
 * measurement". Demanding a per-line date inside a file like that would push
 * edits into recorded evidence, which is precisely the dishonesty this gate is
 * meant to prevent. Only documents presenting as current must attribute inline.
 *
 * The marker must appear in the title and nowhere else, because prose that
 * merely mentions history is not an archive. `docs/release/status.md` is the
 * operational source of truth and says "Historical V1 evidence is preserved,
 * but it does not prove the current V2 contract" in its opening paragraph:
 * reading the whole header would let that one sentence excuse every stale
 * claim in the file the release depends on most.
 */
const ARCHIVAL =
  /\b(?:historical|history|archived?|archive|superseded|retained as|retained only as|predates|snapshot)\b/iu;

function fail(message) {
  process.stderr.write(`truth-consistency: ${message}\n`);
  process.exit(1);
}

function trackedMarkdown() {
  const output = execFileSync("git", ["ls-files", "-z", "*.md"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return output.split("\0").filter((line) => line.length > 0);
}

/**
 * Line numbers that sit inside a fenced block, so callers can skip them while
 * still reporting true 1-based positions for everything else.
 */
function fencedLines(lines) {
  const fenced = new Set();
  let fence = null;
  lines.forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (marker !== null) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      fenced.add(index + 1);
      return;
    }
    if (fence !== null) fenced.add(index + 1);
  });
  return fenced;
}

/**
 * Groups lines into the smallest block that carries a single claim, so a
 * qualifier one line above still counts. A sentence wraps across lines, but a
 * list item and a table row are self-contained: without that split, the
 * "Historical V1 deployment" bullet in a status list would silently vouch for
 * every other bullet beside it.
 *
 * Returns each line's whole unit and, separately, only the part of the unit
 * that PRECEDES it. The contract check needs the second form: the paragraph in
 * `docs/blockers.md` that states the live V2 address ends by saying everything
 * BELOW it is V1-era, and read as one blob that trailing sentence excused a
 * wrong address sitting four lines above it.
 */
function unitTexts(lines) {
  const startsUnit = /^\s*(?:[-*+]\s|\d+[.)]\s|\||#{1,6}\s|>)/u;
  const ids = [];
  let id = 0;
  lines.forEach((line, index) => {
    if (line.trim().length === 0) {
      id += 1;
      ids[index] = -1;
      return;
    }
    if (startsUnit.test(line) && index > 0 && ids[index - 1] !== -1) id += 1;
    ids[index] = id;
  });

  const byId = new Map();
  const before = [];
  lines.forEach((line, index) => {
    if (ids[index] === -1) {
      before[index] = "";
      return;
    }
    before[index] = byId.get(ids[index]) ?? "";
    byId.set(ids[index], `${byId.get(ids[index]) ?? ""}\n${line}`);
  });
  return {
    texts: lines.map((_, index) => (ids[index] === -1 ? "" : byId.get(ids[index]))),
    before,
  };
}

/** The document's own title, or "" when it has no top-level heading. */
function title(lines) {
  return lines.find((line) => /^#\s+\S/u.test(line)) ?? "";
}

/** How many tools the production MCP route actually registers. */
function registeredToolCount() {
  const source = readFileSync(join(REPO_ROOT, MCP_ROUTE), "utf8");
  const matches = source.match(/server\.registerTool\(/gu);
  if (matches === null) fail(`no server.registerTool( calls found in ${MCP_ROUTE}; the gate cannot derive the tool count`);
  return matches.length;
}

/** The live settlement contract, read from the module that declares it. */
function canonicalContract() {
  const source = readFileSync(join(REPO_ROOT, CONTRACT_MODULE), "utf8");
  const match = CONTRACT_EXPORT.exec(source);
  if (match === null) fail(`no VERIFIED_V2_CONTRACT export found in ${CONTRACT_MODULE}; the gate cannot derive the address`);
  return match[1];
}

/**
 * Tracked source, excluding tests. Test files bind contract-shaped names to
 * `0x1111…` fixtures on purpose, and a fixture is not a claim about what is
 * deployed; forcing them to the real address would make every test read as if
 * it were talking to production.
 */
function trackedSource() {
  const output = execFileSync("git", ["ls-files", "-z", "*.ts", "*.tsx", "*.mjs", "*.js", "*.sol", ".env.example"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return output
    .split("\0")
    .filter((file) => file.length > 0)
    .filter((file) => !/(?:^|\/)tests?\/|\.test\.|(?:^|\/)test-/u.test(file));
}

function main() {
  const expected = registeredToolCount();
  const contract = canonicalContract();

  const problems = [];
  let bindings = 0;

  // Code first: a landing page advertising a contract the server no longer
  // uses is the failure this half exists to catch, and nothing connected the
  // two copies before.
  for (const file of trackedSource()) {
    const lines = readFileSync(join(REPO_ROOT, file), "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(CONTRACT_BINDING)) {
        bindings += 1;
        if (match[1].toLowerCase() === contract.toLowerCase()) continue;
        problems.push({
          file,
          number: index + 1,
          detail: `binds a contract-shaped name to ${match[1]}, but ${CONTRACT_MODULE} declares ${contract}`,
        });
      }
    });
  }

  // The declaration in CONTRACT_MODULE is itself a contract-shaped binding, so
  // a zero here does not mean the code is clean: it means the file list or the
  // pattern stopped matching and the code half is checking nothing.
  if (bindings === 0) {
    fail(`no contract-shaped bindings found in tracked source; the code half of this gate is not checking anything`);
  }

  const expectedWord = NUMBER_WORDS[expected] ?? null;
  const accepted = new Set([String(expected), expectedWord].filter((value) => value !== null));

  const files = trackedMarkdown();
  let claims = 0;

  for (const file of files) {
    const source = readFileSync(join(REPO_ROOT, file), "utf8");
    const lines = source.split(/\r?\n/u);
    const fenced = fencedLines(lines);
    const { texts: units, before: unitsBefore } = unitTexts(lines);
    const archival = ARCHIVAL.test(title(lines));

    lines.forEach((line, index) => {
      const number = index + 1;
      if (fenced.has(number)) return;
      const unit = units[index];

      for (const match of line.matchAll(TOOL_CLAIM)) {
        claims += 1;
        if (accepted.has(match[1].toLowerCase())) continue;
        if (NOT_CURRENT.test(unit) || NOT_ASSERTED.test(unit)) continue;
        problems.push({
          file,
          number,
          detail: `claims "${match[0].trim()}" as current but ${MCP_ROUTE} registers ${expected}`,
        });
      }

      if (line.includes(V1_ADDRESS)) {
        claims += 1;
        if (!archival && !NOT_CURRENT.test(unit) && !NOT_ASSERTED.test(unit)) {
          problems.push({
            file,
            number,
            detail: "names the superseded V1 contract without a V1 or historical qualifier",
          });
        }
      }

      // A line that says which contract is live must name the live one. The
      // qualifier escape is the same one V1 gets: documented history may quote
      // the address it was written against, it just may not present it as now.
      const named = CONTRACT_CLAIM.test(line);
      for (const found of line.matchAll(ADDRESS)) {
        const before = `${lines[index - 1] ?? ""}\n${line.slice(0, found.index)}`;
        if (!named && !CONTRACT_LEAD.test(before.slice(-CONTRACT_LEAD_WINDOW))) continue;
        if (found[0] === V1_ADDRESS) continue; // already judged by the V1 rule above
        claims += 1;
        if (found[0].toLowerCase() === contract.toLowerCase()) continue;
        const qualified = `${unitsBefore[index]}\n${line.slice(0, found.index)}`;
        if (archival || NOT_CURRENT.test(qualified) || NOT_ASSERTED.test(qualified)) continue;
        problems.push({
          file,
          number,
          detail: `presents ${found[0]} as the settlement contract, but ${CONTRACT_MODULE} declares ${contract}`,
        });
      }

      if (TEST_TOTAL.test(line)) {
        claims += 1;
        if (
          !archival
          && !DATED.test(unit)
          && !BASELINE.test(unit)
          && !NOT_CURRENT.test(unit)
          && !NOT_ASSERTED.test(unit)
        ) {
          problems.push({
            file,
            number,
            detail: "asserts a test total with no measurement date and no historical marker",
          });
        }
      }
    });
  }

  if (problems.length > 0) {
    const lines = problems.map(({ file, number, detail }) => `  ${file}:${number} ${detail}`);
    fail(`${problems.length} stale or unattributed claim(s):\n${lines.join("\n")}`);
  }

  process.stdout.write(
    `truth-consistency: ${claims} claims across ${files.length} tracked markdown files and ${bindings} contract bindings in tracked source agree with the code (${expected} MCP tools, settlement contract ${contract})\n`,
  );
}

main();
