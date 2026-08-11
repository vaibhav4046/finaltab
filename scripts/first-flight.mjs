#!/usr/bin/env node
/**
 * FINALTab first-flight — `node scripts/first-flight.mjs [--recipient 0x..]`
 *
 * Proves the KeeperHub execution leg end-to-end on Base Sepolia with the
 * smallest possible real actions, simulate-first at every step:
 *
 *   Stage A  auth probe        GET /api/keys must return 200 (kh_ org key).
 *                              A wfb_ user key is rejected up front: proven 401.
 *   Stage B  chain sanity      GET /api/chains must list 84532 enabled.
 *   Stage C  zero-value flight simulate -> execute -> poll -> fail-closed verify
 *                              of a 0-value native self-transfer. Must end
 *                              VERIFIED_SETTLED (receipt verified + success).
 * A failed simulation is never broadcast. A transactionHash alone is never
 * treated as proof; only chain-verified receipts flip a stage to green.
 * Contract deployment is intentionally separate: the retired `--deploy`
 * option fails before credentials are loaded or any request is made.
 *
 * Exit codes: 0 all stages verified · 1 failed · 2 unproven (fails closed)
 *             3 blocked/timeout/config (nothing was broadcast in stage C)
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { classify } from "../packages/keeperhub-flight-recorder/bin/kh-proof.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN_ID = 84532; // Base Sepolia
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function parseArgs(argv) {
  const args = { recipient: null, baseUrl: "https://app.keeperhub.com", timeoutMs: 300000, outDir: "proof-output" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--deploy") {
      console.error("RETIRED: first-flight no longer deploys contracts.");
      console.error("Use the simulate-first V2 KeeperHub path: node scripts/deploy-v2-keeperhub.mjs");
      process.exit(3);
    }
    else if (a === "--recipient") args.recipient = argv[++i];
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node scripts/first-flight.mjs [--recipient 0x..] [--base-url URL] [--timeout-ms N] [--out-dir DIR]");
      process.exit(3);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(3);
    }
  }
  return args;
}

/** Env var wins; falls back to apps/web/.env.local where blockers.md says to put the key. */
function loadApiKey() {
  if (process.env.KEEPERHUB_API_KEY) return process.env.KEEPERHUB_API_KEY;
  const envFile = join(ROOT, "apps", "web", ".env.local");
  if (!existsSync(envFile)) return null;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*KEEPERHUB_API_KEY\s*=\s*"?([^"\s#]+)"?\s*$/);
    if (m) return m[1];
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(baseUrl, apiKey, method, path, body, extraHeaders) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: text };
  }
  return { status: res.status, json, headers: res.headers };
}

/**
 * Simulate-first gate. Throws on wouldRevert BEFORE any broadcast.
 * KeeperHub answers would-revert simulations as HTTP 400 with wouldRevert:true,
 * so wouldRevert is read before the status code is classified as an error.
 */
async function simulate(baseUrl, apiKey, path, body) {
  const { status, json } = await api(baseUrl, apiKey, "POST", path, { ...body, simulate: true });
  const obj = json ?? {};
  if (obj.wouldRevert === true) {
    throw new Error(`SIMULATION WOULD REVERT (nothing broadcast): ${obj.revertReason ?? obj.code ?? JSON.stringify(obj)}`);
  }
  if (status >= 400) throw new Error(`simulate ${path} -> HTTP ${status}: ${JSON.stringify(obj)}`);
  if (obj.success !== true) throw new Error(`simulate ${path} did not return success:true: ${JSON.stringify(obj)}`);
  return obj;
}

async function execute(baseUrl, apiKey, path, body, idempotencyKey) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { status, json } = await api(baseUrl, apiKey, "POST", path, body, { "Idempotency-Key": idempotencyKey });
    const obj = json ?? {};
    if (status === 409) {
      const code = obj.code ?? obj.error;
      if (code === "idempotency_in_progress") {
        await sleep(1000);
        continue;
      }
      if (code === "idempotency_conflict" && typeof obj.originalExecutionId === "string" && obj.originalExecutionId) {
        return obj.originalExecutionId;
      }
      throw new Error(`execute ${path} -> 409: ${JSON.stringify(obj)}`);
    }
    if (status >= 400) throw new Error(`execute ${path} -> HTTP ${status}: ${JSON.stringify(obj)}`);
    if (typeof obj.executionId !== "string" || !obj.executionId) throw new Error(`execute response missing executionId: ${JSON.stringify(obj)}`);
    return obj.executionId;
  }
  throw new Error("idempotency_in_progress persisted after retries");
}

/** Poll to terminal honoring X-Poll-Interval-Hint and 429 Retry-After. Null = timeout. */
async function pollTerminal(baseUrl, apiKey, executionId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const { status, json, headers } = await api(baseUrl, apiKey, "GET", `/api/execute/${executionId}/status`);
    if (status === 429) {
      const wait = Number(headers.get("Retry-After") ?? "5");
      await sleep((Number.isFinite(wait) && wait > 0 ? wait : 5) * 1000);
      continue;
    }
    if (status >= 400) throw new Error(`GET status -> HTTP ${status}: ${JSON.stringify(json)}`);
    last = json;
    const hintRaw = headers.get("X-Poll-Interval-Hint");
    const hint = hintRaw === null ? null : Number(hintRaw);
    if (TERMINAL.has(last.status) || hint === 0) return last;
    await sleep((hint !== null && Number.isFinite(hint) && hint > 0 ? hint : 3) * 1000);
  }
  return null;
}

/** Best-effort self-address discovery so the zero-value flight has a recipient. */
async function discoverWalletAddress(baseUrl, apiKey) {
  const { status, json } = await api(baseUrl, apiKey, "GET", "/api/wallets");
  if (status !== 200 || json === null) return null;
  const m = JSON.stringify(json).match(/0x[0-9a-fA-F]{40}/);
  return m ? m[0] : null;
}

/** Runs one simulate -> execute -> poll -> classify leg. Returns {verdict, reason, executionId, terminal}. */
async function fly(baseUrl, apiKey, path, body, label, timeoutMs) {
  console.log(`\n[${label}] simulating (nothing broadcast yet)...`);
  await simulate(baseUrl, apiKey, path, body);
  console.log(`[${label}] simulation clean. Broadcasting via KeeperHub...`);
  const executionId = await execute(baseUrl, apiKey, path, body, randomUUID());
  console.log(`[${label}] executionId ${executionId}. Polling to terminal state...`);
  const terminal = await pollTerminal(baseUrl, apiKey, executionId, timeoutMs);
  if (terminal === null) {
    return { verdict: "PENDING", reason: `timeout: ${executionId} never reached a terminal state within budget`, executionId, terminal: null };
  }
  const c = classify(terminal);
  return { verdict: c.verdict, reason: c.reason, executionId, terminal };
}

function emit(args, report) {
  mkdirSync(args.outDir, { recursive: true });
  const path = join(args.outDir, `first-flight-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`\nReport written: ${path}`);
}

const CODE = { VERIFIED_SETTLED: 0, FAILED: 1, UNPROVEN: 2, PENDING: 3 };

async function main() {
  const args = parseArgs(process.argv);
  const report = { tool: "finaltab-first-flight", startedAt: new Date().toISOString(), chainId: CHAIN_ID, stages: {} };

  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error("KEEPERHUB_API_KEY not set (env or apps/web/.env.local). Needs a kh_ ORGANIZATION key.");
    return 3;
  }
  if (apiKey.startsWith("wfb_")) {
    console.error("This is a wfb_ USER key. Direct execution requires a kh_ ORGANIZATION key");
    console.error("(KeeperHub dashboard: Settings > API Keys > Organisation tab). Proven 401 on this machine.");
    return 3;
  }

  // Stage A: auth probe. /api/keys needs a valid org key; /api/chains is public and proves nothing.
  console.log("[A] auth probe GET /api/keys...");
  const probe = await api(args.baseUrl, apiKey, "GET", "/api/keys");
  report.stages.auth = { httpStatus: probe.status };
  if (probe.status !== 200) {
    console.error(`[A] FAILED: HTTP ${probe.status}. Key is not a valid organization key.`);
    emit(args, report);
    return 3;
  }
  console.log("[A] key accepted.");

  // Stage B: chain sanity.
  console.log("[B] chain sanity GET /api/chains...");
  const chains = await api(args.baseUrl, apiKey, "GET", "/api/chains");
  const list = Array.isArray(chains.json) ? chains.json : chains.json?.chains;
  const base = Array.isArray(list) ? list.find((c) => c.chainId === CHAIN_ID) : undefined;
  report.stages.chain = { found: Boolean(base), enabled: base?.isEnabled ?? null };
  if (!base || base.isEnabled === false) {
    console.error(`[B] FAILED: chain ${CHAIN_ID} missing or disabled: ${JSON.stringify(base ?? null)}`);
    emit(args, report);
    return 3;
  }
  console.log(`[B] Base Sepolia (${CHAIN_ID}) enabled.`);

  // Stage C: zero-value native self-transfer, the cheapest possible real flight.
  let recipient = args.recipient;
  if (!recipient) {
    recipient = await discoverWalletAddress(args.baseUrl, apiKey);
    if (recipient) console.log(`[C] discovered wallet address ${recipient} from /api/wallets.`);
  }
  if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    console.error("[C] No recipient. Pass --recipient <your KeeperHub wallet address> for the zero-value self-transfer.");
    emit(args, report);
    return 3;
  }
  const flightC = await fly(
    args.baseUrl, apiKey, "/api/execute/transfer",
    { chainId: CHAIN_ID, recipientAddress: recipient, amount: "0" },
    "C zero-value flight", args.timeoutMs,
  );
  report.stages.zeroValueFlight = flightC;
  console.log(`[C] ${flightC.verdict}: ${flightC.reason}`);
  if (flightC.verdict !== "VERIFIED_SETTLED") {
    emit(args, report);
    return CODE[flightC.verdict] ?? 3;
  }

  emit(args, report);
  console.log("\nFirst flight verified. Contract deployment is a separate, V2-only KeeperHub workflow.");
  return 0;
}

main().then(
  // Never process.exit() after fetch(): see the kh-proof.mjs note on the
  // Windows libuv 0xC0000409 abort when exiting mid keep-alive teardown.
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(e.message ?? e);
    process.exitCode = 3;
  },
);
