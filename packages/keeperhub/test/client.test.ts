import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FakeKeeperHub } from "./fakeServer.js";
import { KeeperHubClient, PollTimeout } from "../src/client.js";
import { KeeperHubError, SimulationRevertError } from "../src/types.js";

let server: FakeKeeperHub;
let sleeps: number[];

function makeClient(): KeeperHubClient {
  sleeps = [];
  return new KeeperHubClient({
    baseUrl: server.url,
    apiKey: "kh_test_key",
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    maxPollAttempts: 10,
  });
}

beforeEach(async () => {
  server = new FakeKeeperHub();
  await server.start();
});

afterEach(async () => {
  await server.stop();
});

describe("probeAuth", () => {
  it("200 -> ok, sends Bearer", async () => {
    server.script("GET", "/api/keys", [{ status: 200, body: { keys: [] } }]);
    const res = await makeClient().probeAuth();
    expect(res).toEqual({ ok: true, status: 200 });
    expect(server.requests[0]!.headers.authorization).toBe("Bearer kh_test_key");
  });
  it("401 -> not ok (wfb_ key case)", async () => {
    server.script("GET", "/api/keys", [{ status: 401, body: { error: "Unauthorized" } }]);
    const res = await makeClient().probeAuth();
    expect(res).toEqual({ ok: false, status: 401 });
  });

  it("bounds a stalled HTTP handler with request-scoped cancellation", async () => {
    const fetchImpl: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        });
      });
    const client = new KeeperHubClient({
      apiKey: "kh_test_key",
      fetchImpl,
      requestTimeoutMs: 20,
    });
    const error = await client.probeAuth().catch((cause) => cause);
    expect(error).toBeInstanceOf(KeeperHubError);
    expect(error.httpStatus).toBe(408);
    expect(error.message).toContain("timed out after 20ms");
  });
});

describe("simulate", () => {
  it("success:true + wouldRevert absent -> returns detail; body carries simulate:true", async () => {
    server.script("POST", "/api/execute/transfer", [{ status: 200, body: { success: true, wouldRevert: false } }]);
    const res = await makeClient().simulateTransfer({
      chainId: 84532,
      recipientAddress: "0xAAAA000000000000000000000000000000000001",
      amount: "0",
    });
    expect(res.success).toBe(true);
    expect((server.requests[0]!.body as Record<string, unknown>).simulate).toBe(true);
  });

  it("HTTP 400 + wouldRevert:true -> SimulationRevertError with revert detail (NOT a plain 400)", async () => {
    server.script("POST", "/api/execute/transfer", [
      {
        status: 400,
        body: {
          wouldRevert: true,
          revertReason: "transfer amount exceeds balance",
          code: "insufficient_balance",
          balanceWei: "0",
          requiredWei: "1000000",
          shortfallWei: "1000000",
          nativeSymbol: "ETH",
        },
      },
    ]);
    const err = await makeClient()
      .simulateTransfer({ chainId: 84532, recipientAddress: "0xAAAA000000000000000000000000000000000001", amount: "1" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(SimulationRevertError);
    expect(err.detail.code).toBe("insufficient_balance");
    expect(err.detail.shortfallWei).toBe("1000000");
  });

  it("plain 400 without wouldRevert -> KeeperHubError", async () => {
    server.script("POST", "/api/execute/transfer", [{ status: 400, body: { error: "invalid params" } }]);
    const err = await makeClient()
      .simulateTransfer({ chainId: 84532, recipientAddress: "0xAAAA000000000000000000000000000000000001", amount: "1" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(KeeperHubError);
    expect(err.httpStatus).toBe(400);
  });
});

describe("execute + idempotency", () => {
  const req = { chainId: 84532, recipientAddress: "0xAAAA000000000000000000000000000000000001", amount: "0" };

  it("sends Idempotency-Key header, no simulate flag, returns executionId", async () => {
    server.script("POST", "/api/execute/transfer", [{ status: 200, body: { executionId: "exec_1", status: "pending" } }]);
    const res = await makeClient().executeTransfer(req, "a".repeat(64));
    expect(res.executionId).toBe("exec_1");
    const sent = server.requests[0]!;
    expect(sent.headers["idempotency-key"]).toBe("a".repeat(64));
    expect((sent.body as Record<string, unknown>).simulate).toBeUndefined();
  });

  it("409 idempotency_conflict WITH originalExecutionId -> returns it as replay answer", async () => {
    server.script("POST", "/api/execute/transfer", [
      { status: 409, body: { code: "idempotency_conflict", originalExecutionId: "exec_orig" } },
    ]);
    const res = await makeClient().executeTransfer(req, "b".repeat(64));
    expect(res.executionId).toBe("exec_orig");
    expect(res.idempotentReplay).toBe(true);
  });

  it("409 idempotency_conflict with NULL originalExecutionId -> throws canonicalize guidance", async () => {
    server.script("POST", "/api/execute/transfer", [
      { status: 409, body: { code: "idempotency_conflict", originalExecutionId: null } },
    ]);
    const err = await makeClient().executeTransfer(req, "c".repeat(64)).catch((e) => e);
    expect(err).toBeInstanceOf(KeeperHubError);
    expect(err.message).toContain("canonicalize");
  });

  it("409 idempotency_in_progress -> retries then succeeds", async () => {
    server.script("POST", "/api/execute/transfer", [
      { status: 409, body: { code: "idempotency_in_progress" } },
      { status: 200, body: { executionId: "exec_2", status: "pending" } },
    ]);
    const res = await makeClient().executeTransfer(req, "d".repeat(64));
    expect(res.executionId).toBe("exec_2");
    expect(server.requests.filter((r) => r.method === "POST").length).toBe(2);
  });

  it("idempotentReplay:true passthrough on replayed 200", async () => {
    server.script("POST", "/api/execute/transfer", [
      { status: 200, body: { executionId: "exec_1", status: "completed", idempotentReplay: true } },
    ]);
    const res = await makeClient().executeTransfer(req, "e".repeat(64));
    expect(res.idempotentReplay).toBe(true);
  });
});

describe("pollUntilTerminal", () => {
  it("honors X-Poll-Interval-Hint seconds between polls", async () => {
    server.script("GET", "/api/execute/exec_1/status", [
      { status: 200, headers: { "X-Poll-Interval-Hint": "2" }, body: { executionId: "exec_1", status: "pending" } },
      { status: 200, headers: { "X-Poll-Interval-Hint": "7" }, body: { executionId: "exec_1", status: "submitted" } },
      { status: 200, headers: { "X-Poll-Interval-Hint": "0" }, body: { executionId: "exec_1", status: "completed", receipts: [] } },
    ]);
    const res = await makeClient().pollUntilTerminal("exec_1");
    expect(res.status).toBe("completed");
    expect(sleeps).toEqual([2000, 7000]);
  });

  it("hint 0 on non-terminal-looking body still stops (0 = terminal per docs)", async () => {
    server.script("GET", "/api/execute/exec_2/status", [
      { status: 200, headers: { "X-Poll-Interval-Hint": "0" }, body: { executionId: "exec_2", status: "failed", error: "reverted" } },
    ]);
    const res = await makeClient().pollUntilTerminal("exec_2");
    expect(res.status).toBe("failed");
    expect(sleeps).toEqual([]);
  });

  it("429 with Retry-After pauses exactly that long then resumes", async () => {
    server.script("GET", "/api/execute/exec_3/status", [
      { status: 429, headers: { "Retry-After": "11" }, body: { error: "rate limited" } },
      { status: 200, headers: { "X-Poll-Interval-Hint": "0" }, body: { executionId: "exec_3", status: "completed", receipts: [] } },
    ]);
    const res = await makeClient().pollUntilTerminal("exec_3");
    expect(res.status).toBe("completed");
    expect(sleeps).toEqual([11000]);
  });

  it("times out with PollTimeout after maxPollAttempts, keeps last status", async () => {
    server.script("GET", "/api/execute/exec_4/status", [
      { status: 200, headers: { "X-Poll-Interval-Hint": "1" }, body: { executionId: "exec_4", status: "pending" } },
    ]);
    const err = await makeClient().pollUntilTerminal("exec_4").catch((e) => e);
    expect(err).toBeInstanceOf(PollTimeout);
    expect(err.lastStatus.status).toBe("pending");
  });
});
