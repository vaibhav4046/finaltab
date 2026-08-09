import { describe, it, expect } from "vitest";
import { classifyExecution } from "../src/verify.js";
import type { ExecutionReceipt, ExecutionStatusResponse } from "../src/types.js";

const goodReceipt: ExecutionReceipt = {
  hash: "0xabc",
  chainId: 84532,
  verified: true,
  receiptStatus: "success",
  blockNumber: 123,
  gasUsed: "21000",
  verifiedAt: "2026-08-09T00:00:00Z",
};

function status(partial: Partial<ExecutionStatusResponse>): ExecutionStatusResponse {
  return { executionId: "exec_1", status: "completed", ...partial };
}

describe("classifyExecution — fail-closed semantics", () => {
  it("VERIFIED_SETTLED only when completed + all receipts verified successful", () => {
    const v = classifyExecution(status({ receipts: [goodReceipt, { ...goodReceipt, hash: "0xdef" }] }));
    expect(v.verdict).toBe("VERIFIED_SETTLED");
  });

  it("completed + transactionHash but EMPTY receipts -> UNPROVEN (hash alone is never proof)", () => {
    const v = classifyExecution(status({ transactionHash: "0xselfreported", receipts: [] }));
    expect(v.verdict).toBe("UNPROVEN");
  });

  it("completed + receipts undefined -> UNPROVEN", () => {
    const v = classifyExecution(status({ receipts: undefined }));
    expect(v.verdict).toBe("UNPROVEN");
  });

  it("one receipt verified:false among good ones -> UNPROVEN", () => {
    const v = classifyExecution(
      status({ receipts: [goodReceipt, { ...goodReceipt, hash: "0x2", verified: false }] }),
    );
    expect(v.verdict).toBe("UNPROVEN");
  });

  it("receiptStatus reverted -> FAILED", () => {
    const v = classifyExecution(status({ receipts: [{ ...goodReceipt, receiptStatus: "reverted" }] }));
    expect(v.verdict).toBe("FAILED");
  });

  it("receiptStatus safe_inner_failure -> FAILED", () => {
    const v = classifyExecution(status({ receipts: [{ ...goodReceipt, receiptStatus: "safe_inner_failure" }] }));
    expect(v.verdict).toBe("FAILED");
  });

  it("receiptStatus not_found -> UNPROVEN (fails closed, not failed)", () => {
    const v = classifyExecution(status({ receipts: [{ ...goodReceipt, receiptStatus: "not_found" }] }));
    expect(v.verdict).toBe("UNPROVEN");
  });

  it("receiptStatus timeout -> UNPROVEN (fails closed)", () => {
    const v = classifyExecution(status({ receipts: [{ ...goodReceipt, receiptStatus: "timeout" }] }));
    expect(v.verdict).toBe("UNPROVEN");
  });

  it("status failed -> FAILED with error surfaced", () => {
    const v = classifyExecution(status({ status: "failed", error: "execution reverted", receipts: [] }));
    expect(v.verdict).toBe("FAILED");
    expect((v as { reason: string }).reason).toContain("execution reverted");
  });

  it("status cancelled -> FAILED", () => {
    expect(classifyExecution(status({ status: "cancelled" })).verdict).toBe("FAILED");
  });

  it("status pending/submitted -> PENDING", () => {
    expect(classifyExecution(status({ status: "pending" })).verdict).toBe("PENDING");
    expect(classifyExecution(status({ status: "submitted" })).verdict).toBe("PENDING");
  });
});
