import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const CANONICAL_ENDPOINT = "https://finaltab.vercel.app/api/mcp";
export const PROTOCOL_VERSION = "2025-03-26";
export const EXPECTED_TOOL_NAMES = Object.freeze([
  "split_equal",
  "split_weighted",
  "net_debts",
  "allocate_receipt",
  "prepare_receipt_settlement",
  "simulate_signed_settlement",
  "create_broadcast_approval_challenge",
  "submit_signed_settlement",
  "settlement_status",
]);
export const LIVE_SEQUENCE = Object.freeze([
  Object.freeze({ rpcMethod: "initialize" }),
  Object.freeze({ rpcMethod: "tools/list" }),
  Object.freeze({ rpcMethod: "tools/call", toolName: "allocate_receipt" }),
  Object.freeze({ rpcMethod: "tools/call", toolName: "prepare_receipt_settlement" }),
  Object.freeze({ rpcMethod: "tools/call", toolName: "create_broadcast_approval_challenge" }),
]);

const SECRET_KEY_PATTERN = /(?:authorization|bearer|token|secret|private(?:key)?|signature|signatures|signedsettlement|signaturerequests|message|body|content|raw)/i;
const SIGNATURE_PATTERN = /0x[0-9a-f]{130}/i;
const BEARER_PATTERN = /bearer\s+[a-z0-9._~+/=-]+/i;
const HASH32_PATTERN = /^0x[0-9a-f]{64}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const FORBIDDEN_LIVE_TOOLS = new Set([
  "simulate_signed_settlement",
  "submit_signed_settlement",
  "settlement_status",
  "sign",
  "broadcast",
  "execute",
]);

export class CaptureSafetyError extends Error {
  constructor(code) {
    super(code);
    this.name = "CaptureSafetyError";
    this.code = code;
  }
}

function invariant(condition, code) {
  if (!condition) throw new CaptureSafetyError(code);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseStructuredResult(response, expectedTool) {
  invariant(response && typeof response === "object", `${expectedTool.toUpperCase()}_EMPTY_RESPONSE`);
  invariant(!response.error, `${expectedTool.toUpperCase()}_RPC_ERROR`);
  const result = response.result;
  invariant(result && typeof result === "object", `${expectedTool.toUpperCase()}_MISSING_RESULT`);
  invariant(result.isError !== true, `${expectedTool.toUpperCase()}_TOOL_ERROR`);
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const text = Array.isArray(result.content)
    ? result.content.find((entry) => entry && entry.type === "text" && typeof entry.text === "string")?.text
    : undefined;
  invariant(typeof text === "string", `${expectedTool.toUpperCase()}_MISSING_STRUCTURED_CONTENT`);
  try {
    const parsed = JSON.parse(text);
    invariant(parsed && typeof parsed === "object", `${expectedTool.toUpperCase()}_INVALID_STRUCTURED_CONTENT`);
    return parsed;
  } catch (error) {
    if (error instanceof CaptureSafetyError) throw error;
    throw new CaptureSafetyError(`${expectedTool.toUpperCase()}_INVALID_STRUCTURED_CONTENT`);
  }
}

function assertExactToolCatalog(response) {
  invariant(response && typeof response === "object" && !response.error, "TOOLS_LIST_RPC_ERROR");
  const tools = response.result?.tools;
  invariant(Array.isArray(tools), "TOOLS_LIST_MISSING");
  const names = tools.map((tool) => tool?.name);
  invariant(names.every((name) => typeof name === "string"), "TOOLS_LIST_INVALID_NAME");
  const expected = [...EXPECTED_TOOL_NAMES].sort();
  invariant(names.length === expected.length, "TOOLS_LIST_COUNT_MISMATCH");
  invariant(JSON.stringify([...names].sort()) === JSON.stringify(expected), "TOOLS_LIST_CONTENT_MISMATCH");
  return names;
}

function assertInput(input) {
  invariant(input && typeof input === "object", "INPUT_INVALID");
  invariant(input.receipt?.currency === "USD", "INPUT_NOT_USD");
  invariant(Array.isArray(input.receipt?.lines) && input.receipt.lines.length > 0, "INPUT_LINES_MISSING");
  invariant(Array.isArray(input.participants) && input.participants.length >= 2, "INPUT_PARTICIPANTS_MISSING");
  invariant(Array.isArray(input.assignments), "INPUT_ASSIGNMENTS_MISSING");
  invariant(input.assignments.length === input.receipt.lines.length, "INPUT_ASSIGNMENT_COUNT_MISMATCH");
  const lineIds = new Set(input.receipt.lines.map((line) => line.id));
  invariant(lineIds.size === input.receipt.lines.length, "INPUT_DUPLICATE_LINE_ID");
  invariant(input.assignments.every((assignment) => lineIds.has(assignment.lineId)), "INPUT_UNKNOWN_ASSIGNMENT_LINE");
  const totalMinor = input.receipt.lines.reduce((sum, line) => {
    invariant(/^\d+(?:\.\d{1,2})?$/.test(line.amountUsd), "INPUT_INVALID_AMOUNT");
    const [whole, fraction = ""] = line.amountUsd.split(".");
    return sum + (BigInt(whole) * 100n) + BigInt(fraction.padEnd(2, "0"));
  }, 0n);
  const stated = input.receipt.statedTotalUsd;
  invariant(typeof stated === "string", "INPUT_STATED_TOTAL_MISSING");
  const [whole, fraction = ""] = stated.split(".");
  invariant(totalMinor === (BigInt(whole) * 100n) + BigInt(fraction.padEnd(2, "0")), "INPUT_TOTAL_MISMATCH");
  const participant = input.participants.find((entry) => entry.id === input.challengeApproverParticipantId);
  invariant(participant && ADDRESS_PATTERN.test(participant.address), "INPUT_CHALLENGE_APPROVER_INVALID");
  invariant(input.participants.some((entry) => entry.id === input.payerId), "INPUT_PAYER_INVALID");
  return { totalMinor, challengeApprover: participant.address };
}

function assertSafeRequest(stepIndex, rpcMethod, toolName) {
  invariant(!toolName || !FORBIDDEN_LIVE_TOOLS.has(toolName), "FORBIDDEN_TOOL_REQUESTED");
  const expected = LIVE_SEQUENCE[stepIndex];
  invariant(Boolean(expected), "HARD_STOP_ALREADY_REACHED");
  invariant(rpcMethod === expected.rpcMethod, "RPC_SEQUENCE_VIOLATION");
  invariant((toolName ?? undefined) === expected.toolName, "TOOL_SEQUENCE_VIOLATION");
}

function sanitizeInitialize(response) {
  invariant(response && typeof response === "object" && !response.error, "INITIALIZE_RPC_ERROR");
  const info = response.result?.serverInfo;
  invariant(info && typeof info.name === "string" && typeof info.version === "string", "INITIALIZE_SERVER_INFO_MISSING");
  return { server: info.name, version: info.version, authenticated: true };
}

function sanitizeAllocation(value, input) {
  invariant(value.currency === "USD", "ALLOCATION_CURRENCY_MISMATCH");
  invariant(value.total === input.receipt.statedTotalUsd, "ALLOCATION_TOTAL_MISMATCH");
  invariant(value.sumsToTotal === true, "ALLOCATION_NOT_BALANCED");
  invariant(Array.isArray(value.participants), "ALLOCATION_PARTICIPANTS_MISSING");
  invariant(Array.isArray(value.lines), "ALLOCATION_LINES_MISSING");
  return {
    receiptId: String(value.receiptId),
    currency: "USD",
    total: value.total,
    participantCount: value.participants.length,
    lineCount: value.lines.length,
    sumsToTotal: true,
  };
}

function sanitizePreparation(value, input) {
  invariant(value.v2 === true, "PREPARATION_NOT_V2");
  invariant(Number.isInteger(value.chainId), "PREPARATION_CHAIN_INVALID");
  invariant(ADDRESS_PATTERN.test(value.contract), "PREPARATION_CONTRACT_INVALID");
  invariant(HASH32_PATTERN.test(value.settlementId), "PREPARATION_SETTLEMENT_ID_INVALID");
  invariant(HASH32_PATTERN.test(value.ledgerHash), "PREPARATION_LEDGER_HASH_INVALID");
  invariant(value.payerId === input.payerId, "PREPARATION_PAYER_MISMATCH");
  invariant(Array.isArray(value.debits) && value.debits.length > 0, "PREPARATION_DEBITS_MISSING");
  invariant(Array.isArray(value.payouts) && value.payouts.length > 0, "PREPARATION_PAYOUTS_MISSING");
  invariant(Array.isArray(value.signatureRequests), "PREPARATION_REQUEST_COUNT_MISSING");
  return {
    v2: true,
    chainId: value.chainId,
    contract: value.contract,
    settlementId: value.settlementId,
    ledgerHash: value.ledgerHash,
    payerId: value.payerId,
    debitCount: value.debits.length,
    payoutCount: value.payouts.length,
    externalWalletRequestCount: value.signatureRequests.length,
  };
}

function sanitizeChallenge(value) {
  invariant(value.broadcast === false, "CHALLENGE_BROADCAST_FLAG_UNSAFE");
  return {
    created: true,
    broadcast: false,
    walletActionPerformed: false,
    challengePayloadRetained: false,
  };
}

function assertSanitized(value, credential) {
  const encoded = JSON.stringify(value);
  invariant(!credential || !encoded.includes(credential), "ARTIFACT_CONTAINS_CREDENTIAL");
  invariant(!BEARER_PATTERN.test(encoded), "ARTIFACT_CONTAINS_BEARER");
  invariant(!SIGNATURE_PATTERN.test(encoded), "ARTIFACT_CONTAINS_SIGNATURE_BYTES");
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      invariant(!SECRET_KEY_PATTERN.test(key), "ARTIFACT_CONTAINS_SENSITIVE_FIELD");
      visit(child);
    }
  };
  visit(value);
}

export async function runMcpCapture({ transport, input }) {
  invariant(transport && typeof transport.request === "function", "TRANSPORT_INVALID");
  const inputFacts = assertInput(input);
  let stepIndex = 0;
  const events = [];
  const call = async (rpcMethod, toolName, args) => {
    assertSafeRequest(stepIndex, rpcMethod, toolName);
    const startedAt = performance.now();
    const response = await transport.request({ rpcMethod, toolName, arguments: args });
    const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
    stepIndex += 1;
    return { response, elapsedMs };
  };

  const initialized = await call("initialize");
  events.push({ order: 1, operation: "initialize", status: "passed", elapsedMs: initialized.elapsedMs, facts: sanitizeInitialize(initialized.response) });

  const listed = await call("tools/list");
  const toolNames = assertExactToolCatalog(listed.response);
  events.push({ order: 2, operation: "tools/list", status: "passed", elapsedMs: listed.elapsedMs, facts: { toolCount: toolNames.length, tools: toolNames } });

  const allocationArgs = {
    receipt: input.receipt,
    participants: input.participants.map(({ id, name }) => ({ id, name })),
    assignments: input.assignments,
  };
  const allocated = await call("tools/call", "allocate_receipt", allocationArgs);
  const allocation = sanitizeAllocation(parseStructuredResult(allocated.response, "allocate_receipt"), input);
  events.push({ order: 3, operation: "allocate_receipt", status: "passed", elapsedMs: allocated.elapsedMs, facts: allocation });

  const preparedCall = await call("tools/call", "prepare_receipt_settlement", {
    receipt: input.receipt,
    participants: input.participants,
    assignments: input.assignments,
    payerId: input.payerId,
  });
  const prepared = sanitizePreparation(parseStructuredResult(preparedCall.response, "prepare_receipt_settlement"), input);
  events.push({ order: 4, operation: "prepare_receipt_settlement", status: "passed", elapsedMs: preparedCall.elapsedMs, facts: prepared });

  const challengeCall = await call("tools/call", "create_broadcast_approval_challenge", {
    settlementId: prepared.settlementId,
    ledgerHash: prepared.ledgerHash,
    approver: inputFacts.challengeApprover,
    ttlSeconds: 600,
  });
  const challenge = sanitizeChallenge(parseStructuredResult(challengeCall.response, "create_broadcast_approval_challenge"));
  events.push({ order: 5, operation: "create_broadcast_approval_challenge", status: "passed", elapsedMs: challengeCall.elapsedMs, facts: challenge });

  invariant(stepIndex === LIVE_SEQUENCE.length, "HARD_STOP_SEQUENCE_INCOMPLETE");
  events.push({
    order: 6,
    operation: "HARD_STOP",
    status: "enforced",
    elapsedMs: 0,
    facts: {
      nextOperation: "none",
      walletApprovalRequested: false,
      walletApprovalPerformed: false,
      simulationPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      valueMoved: false,
    },
  });

  const transcript = {
    schemaVersion: 1,
    captureId: "C07",
    capturedAt: new Date().toISOString(),
    endpoint: CANONICAL_ENDPOINT,
    client: "finaltab-v3-evidence-capture",
    mode: "authenticated-nonbroadcast",
    credential: { source: "ignored-local-capability", copiedToArtifact: false },
    receipt: {
      id: input.receipt.id,
      currency: input.receipt.currency,
      total: input.receipt.statedTotalUsd,
      lineCount: input.receipt.lines.length,
      participantCount: input.participants.length,
      payerId: input.payerId,
    },
    inputSha256: sha256(stableJson(input)),
    events,
    terminalBoundary: "approval-challenge-created-no-wallet-action",
    retainedProofLane: {
      separate: true,
      readOnly: true,
      queriedByThisUtility: false,
      source: "assets/capture-v3/C08-retained-proof.png",
      label: "EARLIER AUTHORIZED RUN · READ ONLY · NOT CREATED BY THIS MCP TEST",
    },
  };
  assertSanitized(transcript);
  return transcript;
}

function parseSseOrJson(raw, contentType, expectedId) {
  if (contentType.includes("text/event-stream")) {
    const messages = raw
      .split(/\r?\n\r?\n/)
      .flatMap((event) => event.split(/\r?\n/).filter((line) => line.startsWith("data:")))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]")
      .map((line) => {
        try { return JSON.parse(line); } catch { throw new CaptureSafetyError("MCP_SSE_INVALID_JSON"); }
      });
    const match = messages.find((message) => message?.id === expectedId);
    invariant(match, "MCP_SSE_RESPONSE_MISSING");
    return match;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new CaptureSafetyError("MCP_RESPONSE_INVALID_JSON");
  }
}

export function createHttpTransport({ credential, fetchImpl = fetch }) {
  invariant(typeof credential === "string" && credential.length >= 20, "CREDENTIAL_INVALID");
  let requestId = 0;
  let sessionId;
  let stepIndex = 0;
  return {
    async request({ rpcMethod, toolName, arguments: args }) {
      assertSafeRequest(stepIndex, rpcMethod, toolName);
      requestId += 1;
      const params = rpcMethod === "initialize"
        ? { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "finaltab-v3-evidence-capture", version: "1.0.0" } }
        : rpcMethod === "tools/list"
          ? {}
          : { name: toolName, arguments: args };
      const headers = {
        authorization: `Bearer ${credential}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      };
      if (sessionId) headers["mcp-session-id"] = sessionId;
      let response;
      try {
        response = await fetchImpl(CANONICAL_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method: rpcMethod, params }),
          redirect: "error",
          signal: AbortSignal.timeout(45_000),
        });
      } catch {
        throw new CaptureSafetyError("MCP_NETWORK_REQUEST_FAILED");
      }
      invariant(response.url === CANONICAL_ENDPOINT, "MCP_ENDPOINT_CHANGED");
      invariant(response.ok, `MCP_HTTP_${response.status}`);
      const responseSession = response.headers.get("mcp-session-id");
      if (responseSession) sessionId = responseSession;
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      invariant(!Number.isFinite(declaredLength) || declaredLength <= 2_000_000, "MCP_RESPONSE_TOO_LARGE");
      const raw = await response.text();
      invariant(Buffer.byteLength(raw, "utf8") <= 2_000_000, "MCP_RESPONSE_TOO_LARGE");
      const parsed = parseSseOrJson(raw, response.headers.get("content-type") ?? "", requestId);
      stepIndex += 1;
      return parsed;
    },
  };
}

export async function loadCredential(credentialPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(credentialPath, "utf8"));
  } catch {
    throw new CaptureSafetyError("CREDENTIAL_FILE_INVALID");
  }
  invariant(parsed && parsed.version === 1 && typeof parsed.token === "string" && parsed.token.length >= 20, "CREDENTIAL_FILE_INVALID");
  return { token: parsed.token };
}

async function writeAtomic(filePath, value, force) {
  await mkdir(path.dirname(filePath), { recursive: true });
  if (!force) {
    try {
      await stat(filePath);
      throw new CaptureSafetyError("OUTPUT_EXISTS_USE_FORCE");
    } catch (error) {
      if (error instanceof CaptureSafetyError) throw error;
      if (error?.code !== "ENOENT") throw new CaptureSafetyError("OUTPUT_STAT_FAILED");
    }
  }
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, value, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, filePath);
}

export async function writeCaptureArtifacts({ transcript, transcriptPath, lockPath, force = false, credential }) {
  assertSanitized(transcript, credential);
  const transcriptJson = stableJson(transcript);
  const lock = {
    schemaVersion: 1,
    status: "lock-ready",
    captureId: "C07",
    artifact: path.basename(transcriptPath),
    artifactSha256: sha256(transcriptJson),
    inputSha256: transcript.inputSha256,
    endpoint: CANONICAL_ENDPOINT,
    exactSequence: LIVE_SEQUENCE,
    hardStopAfter: "create_broadcast_approval_challenge",
    prohibitedActionsPerformed: false,
    credentialCopied: false,
    retainedProofLane: {
      captureId: "C08",
      separate: true,
      readOnly: true,
      queried: false,
    },
  };
  assertSanitized(lock, credential);
  await writeAtomic(transcriptPath, transcriptJson, force);
  await writeAtomic(lockPath, stableJson(lock), force);
  return lock;
}
