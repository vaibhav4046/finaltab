import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: { rpc: vi.fn() },
  createAdmin: vi.fn(),
  simulate: vi.fn(),
  execute: vi.fn(),
  verifyApproval: vi.fn(),
  log: [] as string[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdmin,
}));

vi.mock("@/lib/server/clients", () => ({
  keeperHubClient: () => ({
    client: { simulateContractCall: mocks.simulate, executeContractCall: mocks.execute },
    blockedReason: null,
  }),
}));

vi.mock("@/lib/server/mcpSettlement", () => ({
  verifyBroadcastApproval: mocks.verifyApproval,
}));

vi.mock("@/lib/server/proofCapability", () => ({
  issueProofCapability: () => "proof-capability",
}));

vi.mock("@/lib/server/settlement", () => ({
  SettleBodySchema: { parse: (value: unknown) => value },
  requiredV2SettlementContract: () => "0x1111111111111111111111111111111111111111",
  settleContractCall: () => ({
    taskId: "settlement-plan-task",
    chainId: 84532,
    contractAddress: "0x1111111111111111111111111111111111111111",
    functionName: "executeSettlement",
    functionArgs: "[]",
  }),
}));

import {
  SettlementPersistenceCommitError,
  SettlementPersistenceUnavailableError,
  assertDurableSettlementObservationAccess,
  settlementExecutionIdempotencyKey,
  settlementSubmissionInternals,
  submitApprovedSettlement,
} from "@/lib/server/settlementSubmission";

const BODY = {
  settlementId: `0x${"a".repeat(64)}`,
  ledgerHash: `0x${"b".repeat(64)}`,
  transfers: [{ from: "0x2222222222222222222222222222222222222222" }],
};
const APPROVAL = {
  version: 1 as const,
  approvalId: "123e4567-e89b-42d3-a456-426614174000",
  principalSubject: "principal-a",
  approver: "0x2222222222222222222222222222222222222222" as const,
  chainId: 84532 as const,
  contractAddress: "0x1111111111111111111111111111111111111111" as const,
  settlementId: BODY.settlementId as `0x${string}`,
  ledgerHash: BODY.ledgerHash as `0x${string}`,
  issuedAt: String(Math.floor(Date.now() / 1000) - 30),
  expiresAt: String(Math.floor(Date.now() / 1000) + 600),
  signature: `0x${"1".repeat(130)}` as `0x${string}`,
};

function intent(state: "prepared" | "accepted" = "prepared") {
  const accepted = { executionId: "exec_123456", status: "pending" };
  return {
    idempotency_key: settlementExecutionIdempotencyKey(BODY as never, APPROVAL.contractAddress),
    principal_subject_hash: "1".repeat(64),
    approval_hash: "2".repeat(64),
    approval_expires_at: new Date(Number(APPROVAL.expiresAt) * 1_000).toISOString(),
    signed_body_hash: "3".repeat(64),
    simulation_hash: "4".repeat(64),
    simulation_record: { success: true, wouldRevert: false, source: "durable" },
    plan_hash: BODY.settlementId,
    ledger_hash: BODY.ledgerHash,
    chain_id: 84532,
    contract_address: APPROVAL.contractAddress,
    flow_id: null,
    state,
    execution_id: state === "accepted" ? accepted.executionId : null,
    execution_hash: state === "accepted" ? "5".repeat(64) : null,
    execution_record: state === "accepted" ? accepted : null,
    revision: state === "accepted" ? 2 : 1,
  };
}

beforeEach(() => {
  mocks.log.length = 0;
  mocks.admin.rpc.mockReset();
  mocks.createAdmin.mockReset().mockReturnValue(mocks.admin);
  mocks.simulate.mockReset().mockImplementation(async () => {
    mocks.log.push("simulate");
    return { success: true, wouldRevert: false, source: "provider" };
  });
  mocks.execute.mockReset().mockImplementation(async (_call, key) => {
    mocks.log.push(`execute:${key}`);
    return { executionId: "exec_123456", status: "pending" };
  });
  mocks.verifyApproval.mockReset().mockImplementation(async () => {
    mocks.log.push("verify");
    return { approvalId: APPROVAL.approvalId, approver: APPROVAL.approver };
  });
});

describe("cross-channel durable submission recovery", () => {
  it("returns a durable accepted replay without simulation or execution", async () => {
    mocks.admin.rpc.mockResolvedValueOnce({ data: [intent("accepted")], error: null });
    const result = await submitApprovedSettlement({
      signedSettlement: BODY,
      approval: APPROVAL,
      principalSubject: "principal-a",
      allowedApprovers: [APPROVAL.approver],
    });
    expect(result.durableReplay).toBe(true);
    expect(result.accepted.executionId).toBe("exec_123456");
    expect(mocks.simulate).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("recovers a prepared intent without re-simulation and reuses its deterministic key", async () => {
    const prepared = intent("prepared");
    mocks.admin.rpc
      .mockResolvedValueOnce({ data: [prepared], error: null })
      .mockImplementationOnce(async (_name: string, args: Record<string, unknown>) => ({
        data: [{ ...prepared, state: "accepted", revision: 2, execution_id: "exec_123456", execution_hash: args.execution_digest, execution_record: { executionId: "exec_123456", status: "pending" } }],
        error: null,
      }));
    const result = await submitApprovedSettlement({
      signedSettlement: BODY,
      approval: APPROVAL,
      principalSubject: "principal-a",
      allowedApprovers: [APPROVAL.approver],
    });
    expect(mocks.simulate).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith(expect.anything(), prepared.idempotency_key);
    expect(result.idempotencyKey).toBe(prepared.idempotency_key);
  });

  it("repairs accept-then-database-failure with the same key and no second simulation", async () => {
    const prepared = intent("prepared");
    let retryRead = false;
    let acceptanceAttempts = 0;
    mocks.admin.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "read_durable_settlement_submission_retry") {
        if (retryRead) return { data: [prepared], error: null };
        retryRead = true;
        return { data: [], error: null };
      }
      if (name === "prepare_durable_settlement_submission") return { data: [prepared], error: null };
      if (name === "record_durable_settlement_acceptance") {
        acceptanceAttempts += 1;
        if (acceptanceAttempts === 1) return { data: null, error: { message: "injected commit outage" } };
        return {
          data: [{
            ...prepared,
            state: "accepted",
            revision: 2,
            execution_id: "exec_123456",
            execution_hash: args.execution_digest,
            execution_record: args.accepted_execution_record,
          }],
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    const submit = () => submitApprovedSettlement({
      signedSettlement: BODY,
      approval: APPROVAL,
      principalSubject: "principal-a",
      allowedApprovers: [APPROVAL.approver],
    });
    await expect(submit()).rejects.toBeInstanceOf(SettlementPersistenceCommitError);
    const repaired = await submit();
    expect(repaired.accepted.executionId).toBe("exec_123456");
    expect(mocks.simulate).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.execute.mock.calls[0]?.[1]).toBe(mocks.execute.mock.calls[1]?.[1]);
  });

  it("persists a new intent before execute and runs the DB then wallet final gates", async () => {
    const prepared = intent("prepared");
    mocks.admin.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      mocks.log.push(`rpc:${name}`);
      if (name === "read_durable_settlement_submission_retry") return { data: [], error: null };
      if (name === "prepare_durable_settlement_submission") return { data: [prepared], error: null };
      if (name === "record_durable_settlement_acceptance") {
        return {
          data: [{ ...prepared, state: "accepted", revision: 2, execution_id: "exec_123456", execution_hash: args.execution_digest, execution_record: { executionId: "exec_123456", status: "pending" } }],
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    const beforeBroadcast = vi.fn(async () => { mocks.log.push("beforeBroadcast"); });
    await submitApprovedSettlement({
      signedSettlement: BODY,
      approval: APPROVAL,
      principalSubject: "principal-a",
      allowedApprovers: [APPROVAL.approver],
      beforeBroadcast,
    });
    expect(mocks.log.indexOf("rpc:prepare_durable_settlement_submission"))
      .toBeLessThan(mocks.log.findIndex((entry) => entry.startsWith("execute:")));
    expect(mocks.log.lastIndexOf("beforeBroadcast")).toBeLessThan(mocks.log.lastIndexOf("verify"));
    expect(mocks.log.lastIndexOf("verify")).toBeLessThan(mocks.log.findIndex((entry) => entry.startsWith("execute:")));
    expect(beforeBroadcast).toHaveBeenCalledOnce();
  });

  it("makes zero KeeperHub calls when service persistence is unavailable", async () => {
    mocks.createAdmin.mockReturnValue(null);
    await expect(submitApprovedSettlement({
      signedSettlement: BODY,
      approval: APPROVAL,
      principalSubject: "principal-a",
      allowedApprovers: [APPROVAL.approver],
    })).rejects.toBeInstanceOf(SettlementPersistenceUnavailableError);
    expect(mocks.simulate).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe("durable status authority", () => {
  it("classifies timeout/not_found proof receipts identically for both journals", () => {
    expect(settlementSubmissionInternals.observationTarget(
      {
        executionId: "exec_123456",
        status: "completed",
        receipts: [{ hash: `0x${"9".repeat(64)}`, chainId: 84532, verified: false, receiptStatus: "timeout" }],
      },
      { verdict: "UNPROVEN", reason: "receipt timed out", receipts: [] },
      null,
    )).toBe("timeout");
  });

  it("classifies a completed receipt-level revert as a durable failure", () => {
    expect(settlementSubmissionInternals.observationTarget(
      {
        executionId: "exec_123456",
        status: "completed",
        receipts: [{ hash: `0x${"8".repeat(64)}`, chainId: 84532, verified: true, receiptStatus: "reverted" }],
      },
      { verdict: "FAILED", reason: "receipt reverted", receipts: [] },
      null,
    )).toBe("failed");
  });

  it("preflights principal and exact proof-capability authority before any provider poll", async () => {
    mocks.admin.rpc.mockResolvedValue({ data: true, error: null });
    await assertDurableSettlementObservationAccess({
      executionId: "exec_123456",
      principalSubject: "principal-a",
      settlementId: BODY.settlementId as `0x${string}`,
      ledgerHash: BODY.ledgerHash as `0x${string}`,
      contractAddress: APPROVAL.contractAddress,
    });
    expect(mocks.admin.rpc).toHaveBeenLastCalledWith("assert_durable_settlement_observation_access", expect.objectContaining({
      expected_principal_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      capability_authorized: false,
    }));
    await assertDurableSettlementObservationAccess({
      executionId: "exec_123456",
      proofCapabilityAuthorized: true,
      settlementId: BODY.settlementId as `0x${string}`,
      ledgerHash: BODY.ledgerHash as `0x${string}`,
      contractAddress: APPROVAL.contractAddress,
    });
    expect(mocks.admin.rpc).toHaveBeenLastCalledWith("assert_durable_settlement_observation_access", expect.objectContaining({
      expected_principal_hash: null,
      capability_authorized: true,
    }));
  });

  it("keeps repeat terminal evidence monotonic despite volatile provider timestamps", () => {
    const migration = readFileSync(
      fileURLToPath(new URL("../../../supabase/migrations/20260811074000_durable_submission_intents.sql", import.meta.url)),
      "utf8",
    );
    expect(migration).toContain("elsif intent.state = target_state then");
    expect(migration).toContain("if intent.state = 'verified_settled' then");
    expect(migration).toContain("expected_principal_hash is not null and intent.principal_subject_hash is distinct from expected_principal_hash");
    expect(migration).toContain("receipt ->> 'receiptStatus' in ('reverted', 'safe_inner_failure')");
    expect(migration).toContain("jsonb_array_length(observed_status_record -> 'receipts') > 20");
  });
});
