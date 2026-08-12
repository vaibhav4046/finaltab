// The journal's SQL is already exercised against a real PostgreSQL engine in
// durableSubmissionJournalEnforcement.test.ts, and the application's replay
// logic is already exercised in settlementSubmission.test.ts — but that second
// suite answers `rpc()` from a mock, so the two halves have never been shown to
// agree. A mocked journal will happily return whatever row the test author
// believed the function returns.
//
// This suite removes the mock. `submitApprovedSettlement` runs unmodified and
// its Supabase calls are translated into the same named-notation SQL PostgREST
// would emit, against a real Postgres carrying this repository's migrations,
// under `set role service_role`. What remains unproven is PostgREST's own HTTP
// translation and the deployed project — not the journal, and not the decision
// the application makes from what the journal returns.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asIdentity, bootSupabaseSchema } from "./helpers/supabasePostgres";

const mocks = vi.hoisted(() => ({
  createAdmin: vi.fn(),
  simulate: vi.fn(),
  execute: vi.fn(),
  verifyApproval: vi.fn(),
  journalCalls: [] as string[],
  providerCalls: [] as string[],
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

const CONTRACT = "0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB";

vi.mock("@/lib/server/settlement", () => ({
  SettleBodySchema: { parse: (value: unknown) => value },
  requiredV2SettlementContract: () => CONTRACT,
  settleContractCall: () => ({
    taskId: "settlement-plan-task",
    chainId: 84532,
    contractAddress: CONTRACT,
    functionName: "executeSettlement",
    functionArgs: "[]",
  }),
}));

import { submitApprovedSettlement } from "@/lib/server/settlementSubmission";

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
  contractAddress: CONTRACT as `0x${string}`,
  settlementId: BODY.settlementId as `0x${string}`,
  ledgerHash: BODY.ledgerHash as `0x${string}`,
  issuedAt: String(Math.floor(Date.now() / 1000) - 30),
  expiresAt: String(Math.floor(Date.now() / 1000) + 600),
  signature: `0x${"1".repeat(130)}` as `0x${string}`,
};

const SUBMISSION = {
  signedSettlement: BODY,
  approval: APPROVAL,
  principalSubject: "principal-a",
  allowedApprovers: [APPROVAL.approver],
};

let database: PGlite;

// jsonb arguments arrive as JavaScript objects; every other argument is already
// a scalar Postgres can coerce from the parameter type the function declares.
const asPostgresArgument = (value: unknown): unknown =>
  typeof value === "object" && value !== null ? JSON.stringify(value) : value;

/**
 * Executes a Supabase `rpc()` the way PostgREST executes one: named notation
 * against the public function, under the service role, returning PostgREST's
 * `{ data, error }` envelope rather than throwing.
 */
const rpcAgainstPostgres = async (name: string, args: Record<string, unknown>) => {
  const argumentNames = Object.keys(args);
  const namedNotation = argumentNames.map((argument, index) => `${argument} => $${index + 1}`).join(", ");
  const values = argumentNames.map((argument) => asPostgresArgument(args[argument]));
  mocks.journalCalls.push(name);
  try {
    const result = await asIdentity(database, { role: "service_role" }, () =>
      database.query(`select * from public.${name}(${namedNotation})`, values),
    );
    return { data: result.rows, error: null };
  } catch (cause) {
    return { data: null, error: { message: (cause as Error).message } };
  }
};

const journalRows = async () => {
  const result = await database.query<{ state: string; execution_id: string | null; revision: number }>(
    "select state, execution_id, revision from public.settlement_submission_intents order by revision",
  );
  return result.rows;
};

beforeAll(async () => {
  database = await bootSupabaseSchema();
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.exec("truncate table public.settlement_submission_intents cascade;");
  mocks.journalCalls.length = 0;
  mocks.providerCalls.length = 0;
  mocks.createAdmin.mockReset().mockReturnValue({ rpc: rpcAgainstPostgres });
  mocks.simulate.mockReset().mockImplementation(async () => {
    mocks.providerCalls.push("simulate");
    return { success: true, wouldRevert: false, source: "provider" };
  });
  mocks.execute.mockReset().mockImplementation(async (_call: unknown, key: string) => {
    mocks.providerCalls.push(`execute:${key}`);
    return { executionId: "exec_123456", status: "pending" };
  });
  mocks.verifyApproval.mockReset().mockImplementation(async () => ({
    approvalId: APPROVAL.approvalId,
    approver: APPROVAL.approver,
  }));
});

describe("durable submission replay through the application path on a real Postgres", () => {
  it("accepts once and then replays the persisted execution without another KeeperHub call", async () => {
    const first = await submitApprovedSettlement(SUBMISSION);
    expect(first.durableReplay).toBe(false);
    expect(first.accepted.executionId).toBe("exec_123456");
    expect(mocks.providerCalls).toEqual(["simulate", `execute:${first.idempotencyKey}`]);

    const providerCallsAfterAcceptance = mocks.providerCalls.length;
    const second = await submitApprovedSettlement(SUBMISSION);

    // The whole point: the second submission is answered from the journal.
    expect(second.durableReplay).toBe(true);
    expect(second.accepted.executionId).toBe(first.accepted.executionId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(mocks.providerCalls).toHaveLength(providerCallsAfterAcceptance);
    expect(mocks.simulate).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);

    // One intent, one execution id: the durable state is what prevents a
    // duplicate broadcast, not an in-memory guard that a restart would lose.
    expect(await journalRows()).toEqual([{ state: "accepted", execution_id: "exec_123456", revision: 2 }]);
  });

  it("reuses the stored successful simulation when an accepted broadcast was never recorded", async () => {
    // Prepare the intent, then fail the acceptance write, which is exactly the
    // crash window the journal exists for.
    mocks.execute.mockImplementationOnce(async (_call: unknown, key: string) => {
      mocks.providerCalls.push(`execute:${key}`);
      throw new Error("connection reset before the acceptance was recorded");
    });
    await expect(submitApprovedSettlement(SUBMISSION)).rejects.toThrow(/connection reset/);
    expect(await journalRows()).toEqual([{ state: "prepared", execution_id: null, revision: 1 }]);

    const simulationsBeforeRecovery = mocks.simulate.mock.calls.length;
    const recovered = await submitApprovedSettlement(SUBMISSION);

    // Re-simulating here could revert as AlreadySettled and strand the
    // execution id, so recovery must come from the durable record.
    expect(mocks.simulate).toHaveBeenCalledTimes(simulationsBeforeRecovery);
    expect(recovered.simulation).toMatchObject({ success: true, wouldRevert: false });
    expect(recovered.accepted.executionId).toBe("exec_123456");
    expect(await journalRows()).toEqual([{ state: "accepted", execution_id: "exec_123456", revision: 2 }]);
  });

  it("makes no KeeperHub call at all when the journal refuses the write", async () => {
    // A revoked execute grant stands in for any journal outage. The gate is
    // that the provider is never reached, so no value can move unjournalled.
    await database.exec("revoke execute on function public.prepare_durable_settlement_submission from service_role;");
    try {
      await expect(submitApprovedSettlement(SUBMISSION)).rejects.toThrow(/SUBMISSION_INTENT_COMMIT_FAILED/);
    } finally {
      await database.exec("grant execute on function public.prepare_durable_settlement_submission to service_role;");
    }
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(await journalRows()).toEqual([]);
  });
});
