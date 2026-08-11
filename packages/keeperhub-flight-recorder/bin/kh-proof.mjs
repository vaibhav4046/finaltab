#!/usr/bin/env node
/**
 * KeeperHub Flight Recorder — `pnpm kh:proof --execution <ID>`
 *
 * Fetches an execution's status from KeeperHub, polls to a terminal state
 * (honoring X-Poll-Interval-Hint and 429 Retry-After), applies fail-closed
 * verification, and writes proof artifacts (JSON + Markdown).
 *
 * Exit codes:
 *   0  VERIFIED_SETTLED — terminal success AND >=1 receipt AND every receipt
 *      verified===true with receiptStatus "success"
 *   1  FAILED — terminal failure, or a receipt shows reverted/safe_inner_failure
 *   2  UNPROVEN — terminal success claimed but proof incomplete (empty receipts,
 *      verified!==true, receiptStatus not_found/timeout). Fails closed.
 *   3  TIMEOUT/PENDING — never reached a terminal state within budget
 *
 * A transactionHash alone is NEVER treated as proof of success.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classify } from "../src/classify.mjs";

export { classify } from "../src/classify.mjs";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function parseArgs(argv) {
  const args = { executionId: null, baseUrl: "https://app.keeperhub.com", timeoutMs: 300000, outDir: "proof-output" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execution") args.executionId = argv[++i];
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log("Usage: kh-proof --execution <ID> [--base-url URL] [--timeout-ms N] [--out-dir DIR]");
      process.exit(3);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(3);
    }
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchStatus(baseUrl, apiKey, executionId) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/execute/${executionId}/status`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  return {
    httpStatus: res.status,
    body,
    pollHintSec: res.headers.get("X-Poll-Interval-Hint"),
    retryAfterSec: res.headers.get("Retry-After"),
  };
}

function renderMarkdown(executionId, verdict, reason, status, polls, startedAt) {
  const receipts = status?.receipts ?? [];
  const lines = [
    `# KeeperHub Landed Proof`,
    ``,
    `- **Execution**: \`${executionId}\``,
    `- **Verdict**: **${verdict}**`,
    `- **Reason**: ${reason}`,
    `- **Terminal status**: \`${status?.status ?? "unknown"}\``,
    `- **Sponsored**: ${status?.sponsored === undefined ? "n/a" : String(status.sponsored)}`,
    `- **Polls performed**: ${polls}`,
    `- **Started**: ${startedAt}`,
    `- **Finished**: ${new Date().toISOString()}`,
    ``,
    `## Chain-verified receipts (${receipts.length})`,
    ``,
  ];
  if (receipts.length === 0) {
    lines.push(`_None. A transactionHash without a verified receipt is not proof._`);
  } else {
    lines.push(`| hash | chainId | verified | receiptStatus | block | gasUsed | verifiedAt |`);
    lines.push(`|------|---------|----------|---------------|-------|---------|------------|`);
    for (const r of receipts) {
      lines.push(
        `| \`${r.hash}\` | ${r.chainId} | ${r.verified} | ${r.receiptStatus} | ${r.blockNumber ?? ""} | ${r.gasUsed ?? ""} | ${r.verifiedAt ?? ""} |`,
      );
    }
  }
  lines.push(``, `## Raw terminal status`, ``, "```json", JSON.stringify(status, null, 2), "```", ``);
  return lines.join("\n");
}

// After the first fetch() we must never call process.exit(): on Windows,
// exiting while an undici keep-alive socket is mid-close trips a libuv
// assertion (src\win\async.c UV_HANDLE_CLOSING) and the process dies with
// 0xC0000409 instead of our exit code. Return the code and let the loop drain.
async function main() {
  const args = parseArgs(process.argv);
  if (!args.executionId) {
    console.error("Missing --execution <ID>");
    return 3;
  }
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey) {
    console.error("KEEPERHUB_API_KEY not set (needs kh_ organization key)");
    return 3;
  }

  const startedAt = new Date().toISOString();
  const deadline = Date.now() + args.timeoutMs;
  let polls = 0;
  let last = null;

  while (Date.now() < deadline) {
    let res;
    try {
      res = await fetchStatus(args.baseUrl, apiKey, args.executionId);
    } catch (e) {
      console.error(`Network error polling status: ${e.message}; retrying in 5s`);
      await sleep(5000);
      continue;
    }
    polls++;
    if (res.httpStatus === 429) {
      const wait = Number(res.retryAfterSec ?? "5");
      await sleep((Number.isFinite(wait) && wait > 0 ? wait : 5) * 1000);
      continue;
    }
    if (res.httpStatus >= 400) {
      console.error(`GET status -> HTTP ${res.httpStatus}: ${JSON.stringify(res.body)}`);
      return 3;
    }
    last = res.body;
    const hint = res.pollHintSec === null ? null : Number(res.pollHintSec);
    if (TERMINAL.has(last.status) || hint === 0) break;
    await sleep((hint !== null && Number.isFinite(hint) && hint > 0 ? hint : 3) * 1000);
  }

  if (last === null || !TERMINAL.has(last.status)) {
    const c = { verdict: "PENDING", reason: "timeout: execution never reached a terminal state within budget" };
    emit(args, c, last, polls, startedAt);
    return 3;
  }

  const c = classify(last);
  emit(args, c, last, polls, startedAt);
  if (c.verdict === "VERIFIED_SETTLED") return 0;
  if (c.verdict === "FAILED") return 1;
  if (c.verdict === "UNPROVEN") return 2;
  return 3;
}

function emit(args, c, last, polls, startedAt) {
  const proof = {
    tool: "finaltab-keeperhub-flight-recorder",
    version: "0.1.0",
    executionId: args.executionId,
    verdict: c.verdict,
    reason: c.reason,
    polls,
    startedAt,
    finishedAt: new Date().toISOString(),
    terminalStatus: last,
  };
  mkdirSync(args.outDir, { recursive: true });
  const jsonPath = join(args.outDir, `proof-${args.executionId}.json`);
  const mdPath = join(args.outDir, `proof-${args.executionId}.md`);
  writeFileSync(jsonPath, JSON.stringify(proof, null, 2));
  writeFileSync(mdPath, renderMarkdown(args.executionId, c.verdict, c.reason, last, polls, startedAt));
  console.log(`${c.verdict}: ${c.reason}`);
  console.log(`Proof written: ${jsonPath}`);
  console.log(`Report written: ${mdPath}`);
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isDirectRun) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(e);
      process.exitCode = 3;
    },
  );
}
