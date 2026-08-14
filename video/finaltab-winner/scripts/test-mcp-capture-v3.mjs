import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CaptureSafetyError,
  createHttpTransport,
  EXPECTED_TOOL_NAMES,
  LIVE_SEQUENCE,
  runMcpCapture,
} from "./mcp-capture-v3-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(await readFile(path.resolve(scriptDir, "../data/mcp-v3-complex-input.json"), "utf8"));
const settlementId = `0x${"ab".repeat(32)}`;
const ledgerHash = `0x${"cd".repeat(32)}`;

function responseFor(request, leakedSecret = "") {
  if (request.rpcMethod === "initialize") return { result: { serverInfo: { name: "finaltab", version: "2.0.0" }, leakedSecret } };
  if (request.rpcMethod === "tools/list") return { result: { tools: EXPECTED_TOOL_NAMES.map((name) => ({ name })) } };
  if (request.toolName === "allocate_receipt") return { result: { structuredContent: {
    receiptId: input.receipt.id,
    currency: "USD",
    total: "172.04",
    participants: input.participants.map(({ id, name }) => ({ id, name })),
    lines: input.receipt.lines.map((line) => ({ ...line, amount: line.amountUsd })),
    sumsToTotal: true,
    raw: leakedSecret,
  } } };
  if (request.toolName === "prepare_receipt_settlement") return { result: { structuredContent: {
    v2: true,
    chainId: 84532,
    contract: "0x1111111111111111111111111111111111111111",
    settlementId,
    ledgerHash,
    payerId: "p02",
    debits: [{ value: "1" }],
    payouts: [{ value: "1" }],
    signatureRequests: [{ signature: `0x${"ef".repeat(65)}`, message: leakedSecret }],
  } } };
  if (request.toolName === "create_broadcast_approval_challenge") return { result: { structuredContent: {
    broadcast: false,
    message: leakedSecret,
    signature: `0x${"ef".repeat(65)}`,
  } } };
  throw new Error("unexpected mock request");
}

function mockTransport({ leakedSecret = "", alter } = {}) {
  const calls = [];
  return {
    calls,
    async request(request) {
      calls.push(request);
      const response = responseFor(request, leakedSecret);
      return alter ? alter(request, response) : response;
    },
  };
}

test("uses only the five lock-approved operations and enforces the hard stop", async () => {
  const transport = mockTransport();
  const transcript = await runMcpCapture({ transport, input });
  assert.deepEqual(transport.calls.map(({ rpcMethod, toolName }) => ({ rpcMethod, ...(toolName ? { toolName } : {}) })), LIVE_SEQUENCE);
  assert.equal(transcript.events.at(-1).operation, "HARD_STOP");
  assert.equal(transcript.events.at(-1).facts.valueMoved, false);
  assert.equal(transcript.retainedProofLane.queriedByThisUtility, false);
  assert.equal(transcript.retainedProofLane.separate, true);
});

test("whitelists sanitized facts and drops raw challenge, typed-data, and credential material", async () => {
  const leakedSecret = "credential-value-that-must-never-be-copied";
  const transcript = await runMcpCapture({ transport: mockTransport({ leakedSecret }), input });
  const serialized = JSON.stringify(transcript);
  assert.equal(serialized.includes(leakedSecret), false);
  assert.equal(serialized.includes(`0x${"ef".repeat(65)}`), false);
  assert.equal(serialized.includes("signatureRequests"), false);
  assert.equal(serialized.includes('"message"'), false);
});

test("fails closed when the server tool catalog is not exactly the current nine", async () => {
  const transport = mockTransport({
    alter(request, response) {
      if (request.rpcMethod === "tools/list") response.result.tools.pop();
      return response;
    },
  });
  await assert.rejects(() => runMcpCapture({ transport, input }), (error) => error instanceof CaptureSafetyError && error.code === "TOOLS_LIST_COUNT_MISMATCH");
  assert.equal(transport.calls.length, 2);
});

test("fails closed if challenge creation ever claims a broadcast", async () => {
  const transport = mockTransport({
    alter(request, response) {
      if (request.toolName === "create_broadcast_approval_challenge") response.result.structuredContent.broadcast = true;
      return response;
    },
  });
  await assert.rejects(() => runMcpCapture({ transport, input }), (error) => error instanceof CaptureSafetyError && error.code === "CHALLENGE_BROADCAST_FLAG_UNSAFE");
  assert.equal(transport.calls.length, 5);
});

test("HTTP transport refuses a forbidden tool before fetch can run", async () => {
  let fetchCalls = 0;
  const transport = createHttpTransport({
    credential: "credential-used-only-in-this-mock",
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not run");
    },
  });
  await assert.rejects(
    () => transport.request({ rpcMethod: "tools/call", toolName: "submit_signed_settlement", arguments: {} }),
    (error) => error instanceof CaptureSafetyError && error.code === "FORBIDDEN_TOOL_REQUESTED",
  );
  assert.equal(fetchCalls, 0);
});

test("fixture is cent-exact and includes every item, service, tax, and tip once", () => {
  const cents = input.receipt.lines.reduce((sum, line) => sum + Math.round(Number(line.amountUsd) * 100), 0);
  assert.equal(cents, 17204);
  assert.equal(input.receipt.lines.length, 19);
  assert.equal(input.assignments.length, 19);
  assert.equal(new Set(input.assignments.map((entry) => entry.lineId)).size, 19);
  assert.equal(input.payerId, "p02");
  assert.equal(input.assignments.find((entry) => entry.lineId === "service").weights.some((entry) => entry.participantId === "p08"), false);
});
