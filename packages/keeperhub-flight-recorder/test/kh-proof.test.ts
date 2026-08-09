import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FakeKeeperHub } from "../../keeperhub/test/fakeServer.js";
// classify() is exported from the CLI itself so its logic is unit-testable
// without spawning a process.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs module
import { classify } from "../bin/kh-proof.mjs";

const CLI = resolve(__dirname, "..", "bin", "kh-proof.mjs");

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], env: Record<string, string | undefined>): Promise<RunResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

let server: FakeKeeperHub;
let outDir: string;

beforeEach(async () => {
  server = new FakeKeeperHub();
  await server.start();
  outDir = mkdtempSync(join(tmpdir(), "khproof-"));
});

afterEach(async () => {
  await server.stop();
  rmSync(outDir, { recursive: true, force: true });
});

const goodReceipt = {
  hash: "0xdeadbeef",
  chainId: 84532,
  verified: true,
  receiptStatus: "success",
  blockNumber: 42,
  gasUsed: "21000",
  verifiedAt: "2026-08-09T00:00:00Z",
};

function readProof(executionId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(outDir, `proof-${executionId}.json`), "utf8"));
}

describe("kh-proof CLI exit codes (spawned against fake server)", () => {
  it("exit 0 + VERIFIED_SETTLED proof when pending -> completed with verified receipt", async () => {
    server.script("GET", "/api/execute/exec_ok/status", [
      { status: 200, headers: { "X-Poll-Interval-Hint": "1" }, body: { executionId: "exec_ok", status: "pending" } },
      {
        status: 200,
        headers: { "X-Poll-Interval-Hint": "0" },
        body: { executionId: "exec_ok", status: "completed", sponsored: true, receipts: [goodReceipt] },
      },
    ]);
    const res = await runCli(
      ["--execution", "exec_ok", "--base-url", server.url, "--out-dir", outDir, "--timeout-ms", "30000"],
      { KEEPERHUB_API_KEY: "kh_test" },
    );
    expect(res.stderr).toBe("");
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("VERIFIED_SETTLED");
    const proof = readProof("exec_ok");
    expect(proof.verdict).toBe("VERIFIED_SETTLED");
    expect((proof.terminalStatus as Record<string, unknown>).status).toBe("completed");
    const md = readFileSync(join(outDir, "proof-exec_ok.md"), "utf8");
    expect(md).toContain("VERIFIED_SETTLED");
    expect(md).toContain("0xdeadbeef");
    // polled twice: once pending, once terminal
    expect(server.requests.length).toBe(2);
    expect(server.requests[0]!.headers.authorization).toBe("Bearer kh_test");
  });

  it("exit 1 when status failed", async () => {
    server.script("GET", "/api/execute/exec_fail/status", [
      { status: 200, body: { executionId: "exec_fail", status: "failed", error: "execution reverted", receipts: [] } },
    ]);
    const res = await runCli(
      ["--execution", "exec_fail", "--base-url", server.url, "--out-dir", outDir],
      { KEEPERHUB_API_KEY: "kh_test" },
    );
    expect(res.code).toBe(1);
    expect(res.stdout).toContain("FAILED");
    expect(readProof("exec_fail").reason).toContain("execution reverted");
  });

  it("exit 2 UNPROVEN when completed but receipts empty (hash alone never proof)", async () => {
    server.script("GET", "/api/execute/exec_bare/status", [
      {
        status: 200,
        body: { executionId: "exec_bare", status: "completed", transactionHash: "0xselfreported", receipts: [] },
      },
    ]);
    const res = await runCli(
      ["--execution", "exec_bare", "--base-url", server.url, "--out-dir", outDir],
      { KEEPERHUB_API_KEY: "kh_test" },
    );
    expect(res.code).toBe(2);
    expect(res.stdout).toContain("UNPROVEN");
    const md = readFileSync(join(outDir, "proof-exec_bare.md"), "utf8");
    expect(md).toContain("transactionHash without a verified receipt is not proof");
  });

  it("exit 3 on timeout while still pending", async () => {
    server.script("GET", "/api/execute/exec_slow/status", [
      { status: 200, headers: { "X-Poll-Interval-Hint": "1" }, body: { executionId: "exec_slow", status: "pending" } },
    ]);
    const res = await runCli(
      ["--execution", "exec_slow", "--base-url", server.url, "--out-dir", outDir, "--timeout-ms", "1500"],
      { KEEPERHUB_API_KEY: "kh_test" },
    );
    expect(res.code).toBe(3);
    const proof = readProof("exec_slow");
    expect(proof.verdict).toBe("PENDING");
    expect(String(proof.reason)).toContain("timeout");
  }, 15000);

  it("exit 3 + no artifacts when KEEPERHUB_API_KEY missing", async () => {
    const res = await runCli(
      ["--execution", "exec_x", "--base-url", server.url, "--out-dir", outDir],
      { KEEPERHUB_API_KEY: undefined },
    );
    expect(res.code).toBe(3);
    expect(res.stderr).toContain("KEEPERHUB_API_KEY");
    expect(existsSync(join(outDir, "proof-exec_x.json"))).toBe(false);
  });

  it("honors 429 Retry-After then lands", async () => {
    server.script("GET", "/api/execute/exec_rl/status", [
      { status: 429, headers: { "Retry-After": "1" }, body: { error: "rate limited" } },
      {
        status: 200,
        headers: { "X-Poll-Interval-Hint": "0" },
        body: { executionId: "exec_rl", status: "completed", receipts: [goodReceipt] },
      },
    ]);
    const res = await runCli(
      ["--execution", "exec_rl", "--base-url", server.url, "--out-dir", outDir, "--timeout-ms", "30000"],
      { KEEPERHUB_API_KEY: "kh_test" },
    );
    expect(res.code).toBe(0);
    expect(server.requests.length).toBe(2);
  }, 15000);
});

describe("classify (unit, imported from CLI)", () => {
  it("matches @finaltab/keeperhub fail-closed semantics", () => {
    expect(classify({ status: "completed", receipts: [goodReceipt] }).verdict).toBe("VERIFIED_SETTLED");
    expect(classify({ status: "completed", receipts: [] }).verdict).toBe("UNPROVEN");
    expect(classify({ status: "completed" }).verdict).toBe("UNPROVEN");
    expect(classify({ status: "completed", receipts: [{ ...goodReceipt, verified: false }] }).verdict).toBe("UNPROVEN");
    expect(classify({ status: "completed", receipts: [{ ...goodReceipt, receiptStatus: "not_found" }] }).verdict).toBe("UNPROVEN");
    expect(classify({ status: "completed", receipts: [{ ...goodReceipt, receiptStatus: "timeout" }] }).verdict).toBe("UNPROVEN");
    expect(classify({ status: "completed", receipts: [{ ...goodReceipt, receiptStatus: "reverted" }] }).verdict).toBe("FAILED");
    expect(classify({ status: "completed", receipts: [{ ...goodReceipt, receiptStatus: "safe_inner_failure" }] }).verdict).toBe("FAILED");
    expect(classify({ status: "failed", error: "boom" }).verdict).toBe("FAILED");
    expect(classify({ status: "cancelled" }).verdict).toBe("FAILED");
    expect(classify({ status: "pending" }).verdict).toBe("PENDING");
    expect(classify({ status: "submitted" }).verdict).toBe("PENDING");
  });
});
