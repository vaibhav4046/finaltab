import { describe, expect, it, vi } from "vitest";
import type { ExecutionStatusResponse } from "@finaltab/keeperhub";
import { observeKeeperHubExecution } from "@/lib/server/keeperhubObserver";

const verifiedStatus: ExecutionStatusResponse = {
  executionId: "exec_verified_123",
  status: "completed",
  receipts: [
    {
      hash: `0x${"ab".repeat(32)}`,
      chainId: 84532,
      verified: true,
      receiptStatus: "success",
      blockNumber: 123,
    },
  ],
};
const expected = {
  contractAddress: "0x1111111111111111111111111111111111111111" as const,
  settlementId: `0x${"11".repeat(32)}` as const,
  ledgerHash: `0x${"22".repeat(32)}` as const,
};

describe("KeeperHub observer trust boundary", () => {
  it("re-fetches a pending execution and never runs the chain verifier early", async () => {
    const verify = vi.fn();
    const client = {
      getStatus: vi.fn().mockResolvedValue({
        body: { executionId: "exec_pending_123", status: "pending" },
        pollHintMs: 3_000,
      }),
    };

    const observed = await observeKeeperHubExecution(client, "exec_pending_123", expected, verify);
    expect(client.getStatus).toHaveBeenCalledWith("exec_pending_123");
    expect(verify).not.toHaveBeenCalled();
    expect(observed.terminal).toBe(false);
    expect(observed.verdict.verdict).toBe("PENDING");
  });

  it("returns verified only when KeeperHub and the independent chain check agree", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ body: verifiedStatus, pollHintMs: 0 }),
    };
    const verify = vi.fn().mockResolvedValue({
      method: "base-sepolia-json-rpc" as const,
      checkedAt: "2026-08-11T00:00:00.000Z",
      verified: true,
      receipts: [],
    });

    const observed = await observeKeeperHubExecution(
      client,
      verifiedStatus.executionId,
      expected,
      verify,
      () => new Date("2026-08-11T01:00:00.000Z"),
    );
    expect(verify).toHaveBeenCalledWith(verifiedStatus, expected);
    expect(observed.terminal).toBe(true);
    expect(observed.verdict.verdict).toBe("VERIFIED_SETTLED");
    expect(observed.observedAt).toBe("2026-08-11T01:00:00.000Z");
  });

  it("downgrades a KeeperHub success when independent verification fails", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ body: verifiedStatus, pollHintMs: 0 }),
    };
    const verify = vi.fn().mockResolvedValue({
      method: "base-sepolia-json-rpc" as const,
      checkedAt: "2026-08-11T00:00:00.000Z",
      verified: false,
      receipts: [
        {
          hash: verifiedStatus.receipts![0]!.hash,
          verified: false,
          reason: "expected settlement-contract event is absent",
        },
      ],
    });

    const observed = await observeKeeperHubExecution(client, verifiedStatus.executionId, expected, verify);
    expect(observed.keeperHubVerdict.verdict).toBe("VERIFIED_SETTLED");
    expect(observed.verdict.verdict).toBe("UNPROVEN");
    expect(observed.independent?.verified).toBe(false);
  });
});
