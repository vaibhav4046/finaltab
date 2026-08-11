import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { settlementFlowInternals } from "@/lib/server/settlementFlow";

const SECRET = "unit-test-only-settlement-flow-attestation-secret";
const ATTESTED_AT = "2026-08-11T07:30:00.000Z";

function frozenRow() {
  const row = {
    id: "00000000-0000-4000-8000-000000000201",
    created_by: "00000000-0000-4000-8000-000000000202",
    tab_id: "00000000-0000-4000-8000-000000000203",
    agent_run_id: "00000000-0000-4000-8000-000000000204",
    agent_run_id_snapshot: "00000000-0000-4000-8000-000000000204",
    agent_run_snapshot: { version: 1, id: "00000000-0000-4000-8000-000000000204", status: "ready" },
    agent_run_hash: "",
    receipt_id: "00000000-0000-4000-8000-000000000205",
    allocation_id: "00000000-0000-4000-8000-000000000206",
    ledger_id: "00000000-0000-4000-8000-000000000207",
    settlement_record_id: "00000000-0000-4000-8000-000000000208",
    input_hash: "a".repeat(64),
    canonical_hash: "b".repeat(64),
    transfer_hash: "c".repeat(64),
    ledger_hash: `0x${"d".repeat(64)}`,
    plan_hash: `0x${"e".repeat(64)}`,
    chain_id: 84532,
    contract_address: "0x1111111111111111111111111111111111111111",
    state: "frozen",
    signed_body_hash: null,
    simulation_hash: null,
    execution_id: null,
    execution_hash: null,
    execution_result: null,
    keeperhub_status_hash: null,
    keeperhub_status: null,
    proof_hash: null,
    independent_proof: null,
    revision: 1,
    attested_at: ATTESTED_AT,
    attestation: "",
    created_at: ATTESTED_AT,
    updated_at: ATTESTED_AT,
  };
  row.agent_run_hash = settlementFlowInternals.digest(row.agent_run_snapshot);
  row.attestation = settlementFlowInternals.sign(settlementFlowInternals.flowAttestationPayload(row as never));
  return row;
}

function eventFor(row: ReturnType<typeof frozenRow>, revision = 1) {
  const event = {
    id: revision,
    flow_id: row.id,
    created_by: row.created_by,
    tab_id: row.tab_id,
    revision,
    event_kind: revision === 1 ? "frozen" : "submitted",
    state: row.state,
    payload_hash: "f".repeat(64),
    attested_at: row.attested_at,
    attestation: "",
    created_at: row.created_at,
  };
  event.attestation = settlementFlowInternals.sign(settlementFlowInternals.eventAttestationPayload(event as never));
  return event;
}

beforeEach(() => {
  process.env.FINALTAB_AGENT_ATTESTATION_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.FINALTAB_AGENT_ATTESTATION_SECRET;
});

describe("durable settlement HMAC boundary", () => {
  it("accepts an exact frozen revision and rejects state/null-shape forgery", () => {
    const row = frozenRow();
    const event = eventFor(row);
    expect(settlementFlowInternals.rowIsAttested(row as never)).toBe(true);
    expect(settlementFlowInternals.verifiedFlow(row as never, [event] as never)).toBe(true);
    expect(settlementFlowInternals.rowIsAttested({ ...row, state: "verified_settled" } as never)).toBe(false);
    expect(settlementFlowInternals.rowIsAttested({ ...row, execution_id: "forged_execution" } as never)).toBe(false);
    expect(settlementFlowInternals.rowIsAttested({ ...row, agent_run_snapshot: { version: 1, status: "forged" } } as never)).toBe(false);
    expect(settlementFlowInternals.verifiedFlow(row as never, [] as never)).toBe(false);
  });

  it("recomputes provider and proof JSON hashes instead of trusting signed hash columns", () => {
    const executionResult = { executionId: "keeper_123456", status: "submitted" };
    const row = {
      ...frozenRow(),
      state: "submitted",
      revision: 3,
      signed_body_hash: "1".repeat(64),
      simulation_hash: "2".repeat(64),
      execution_id: "keeper_123456",
      execution_hash: settlementFlowInternals.digest(executionResult),
      execution_result: executionResult,
    };
    row.attestation = settlementFlowInternals.sign(settlementFlowInternals.flowAttestationPayload(row as never));
    expect(settlementFlowInternals.rowIsAttested(row as never)).toBe(true);
    expect(settlementFlowInternals.rowIsAttested({ ...row, execution_result: { executionId: "other" } } as never)).toBe(false);

    const status = { executionId: "keeper_123456", status: "completed", receipts: [] };
    const proof = {
      verified: false,
      executionId: "keeper_123456",
      settlementId: row.plan_hash,
      ledgerHash: row.ledger_hash,
      contractAddress: row.contract_address,
      chainId: row.chain_id,
      receiptHashes: [],
    };
    const terminal = {
      ...row,
      state: "completed_unverified",
      revision: 4,
      keeperhub_status_hash: settlementFlowInternals.digest(status),
      keeperhub_status: status,
      proof_hash: settlementFlowInternals.digest(proof),
      independent_proof: proof,
    };
    terminal.attestation = settlementFlowInternals.sign(settlementFlowInternals.flowAttestationPayload(terminal as never));
    expect(settlementFlowInternals.rowIsAttested(terminal as never)).toBe(true);
    expect(settlementFlowInternals.rowIsAttested({ ...terminal, keeperhub_status: { status: "failed" } } as never)).toBe(false);
    expect(settlementFlowInternals.rowIsAttested({ ...terminal, independent_proof: {} } as never)).toBe(false);

    for (const mismatchedStatus of [
      { ...status, executionId: "keeper_other" },
      { status: "completed", receipts: [] },
    ]) {
      const forged = {
        ...terminal,
        keeperhub_status: mismatchedStatus,
        keeperhub_status_hash: settlementFlowInternals.digest(mismatchedStatus),
      };
      forged.attestation = settlementFlowInternals.sign(settlementFlowInternals.flowAttestationPayload(forged as never));
      expect(settlementFlowInternals.rowIsAttested(forged as never)).toBe(false);
    }
  });

  it("binds the independent proof wrapper to exact execution, plan, ledger, contract and chain", () => {
    const row = { ...frozenRow(), execution_id: "keeper_123456" };
    const proof = settlementFlowInternals.terminalProofRecord({
      flow: row as never,
      status: {
        executionId: "keeper_123456",
        status: "completed",
        receipts: [{ hash: `0x${"9".repeat(64)}`, chainId: 84532, verified: true, receiptStatus: "success" }],
      },
      verdict: { verdict: "VERIFIED_SETTLED", receipts: [] },
      independent: { method: "base-sepolia-json-rpc", checkedAt: ATTESTED_AT, verified: true, receipts: [] },
    });
    expect(proof).toMatchObject({
      verified: true,
      executionId: "keeper_123456",
      settlementId: row.plan_hash,
      ledgerHash: row.ledger_hash,
      contractAddress: row.contract_address,
      chainId: 84532,
    });
  });
});

describe("durable settlement database and route boundary", () => {
  const migration = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/20260811073000_durable_first_party_settlement_flow.sql", import.meta.url)),
    "utf8",
  );
  const cutover = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/20260811074500_financial_truth_post_promotion_cutover.sql", import.meta.url)),
    "utf8",
  );
  const agentMigration = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/20260811052236_settlement_agent_control_plane.sql", import.meta.url)),
    "utf8",
  );
  const server = readFileSync(fileURLToPath(new URL("../lib/server/settlementFlow.ts", import.meta.url)), "utf8");
  const historyRoute = readFileSync(fileURLToPath(new URL("../app/api/settlement-flow/route.ts", import.meta.url)), "utf8");
  const freezeRoute = readFileSync(fileURLToPath(new URL("../app/api/settlement-flow/freeze/route.ts", import.meta.url)), "utf8");
  const simulateRoute = readFileSync(fileURLToPath(new URL("../app/api/settlement-flow/simulate/route.ts", import.meta.url)), "utf8");
  const executeRoute = readFileSync(fileURLToPath(new URL("../app/api/settlement-flow/execute/route.ts", import.meta.url)), "utf8");
  const statusRoute = readFileSync(fileURLToPath(new URL("../app/api/settlement-flow/status/route.ts", import.meta.url)), "utf8");
  const submissionServer = readFileSync(fileURLToPath(new URL("../lib/server/settlementSubmission.ts", import.meta.url)), "utf8");

  it("revokes generic financial mutations and exposes only owner-bound bounded transitions", () => {
    expect(cutover).toContain(
      "revoke truncate, references, trigger, maintain on all tables in schema public",
    );
    expect(cutover).toContain("from public, anon, authenticated");
    for (const table of ["ledgers", "transfers", "signatures", "settlements", "settlement_approvals"]) {
      expect(cutover).toContain(`revoke insert, update, delete on public.${table} from authenticated`);
    }
    expect(migration).not.toContain("revoke insert, update, delete on public.ledgers from authenticated");
    expect(cutover).toContain("revoke execute on function public.consume_voice_quota(text) from authenticated");
    expect(migration).toContain("caller uuid := expected_owner");
    expect(migration.match(/service role required/g)).toHaveLength(6);
    expect(migration.match(/\) to service_role;/g)).toHaveLength(6);
    expect(migration).not.toMatch(/grant execute on function public\.(freeze_reviewed|record_reviewed|assert_reviewed)[\s\S]*?\) to authenticated;/);
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("jsonb_array_length(transfer_rows) > 50");
    expect(migration).toContain("jsonb_typeof(transfer_rows) is distinct from 'array'");
    expect(migration).toContain("private.is_tab_member(tab_id)");
    expect(migration).toContain("private.user_can_edit_settlement_tab(caller, flow.tab_id)");
    expect(migration).toContain("created_by uuid not null");
    expect(migration).not.toContain("created_by uuid not null references auth.users");
    expect(migration).toContain("expected_revision <> flow.revision + 1");
    expect(migration).toContain("required settlement flow identifier is null");
    expect(migration).toContain("required simulation transition argument is null");
    expect(migration).toContain("required execution transition argument is null");
    expect(migration).toContain("required terminal transition argument is null");
    expect(migration).toContain("required reconciliation transition argument is null");
  });

  it("rejects cross-record/hash substitution and keeps transitions idempotent only for exact evidence", () => {
    expect(migration).toContain("RUN_DURABLE_BINDING_MISMATCH");
    expect(migration).toContain("RUN_ALLOCATION_BINDING_MISMATCH");
    expect(migration).toContain("FLOW_FREEZE_MISMATCH");
    expect(migration).toContain("FLOW_SIMULATION_MISMATCH");
    expect(migration).toContain("FLOW_EXECUTION_MISMATCH");
    expect(migration).toContain("FLOW_TERMINAL_MISMATCH");
    expect(server).toContain("CLIENT_SERVER_LEDGER_MISMATCH");
    expect(server).toContain("REVIEWED_PARTICIPANTS_CHANGED");
    expect(server).toContain("REVIEWED_RECEIPT_CHANGED");
    expect(server).toContain("REVIEWED_ALLOCATION_SHARES_CHANGED");
  });

  it("locks and rechecks signed approvals immediately before broadcast without forgeable reservations", () => {
    expect(migration).toContain("create or replace function public.assert_reviewed_settlement_approvals");
    expect(migration).toContain("FLOW_APPROVALS_NOT_CURRENTLY_SIGNED");
    expect(migration).toContain("for update;");
    expect(migration).not.toContain("settlement_execution_reservations");
    expect(executeRoute).toContain("beforeBroadcast: () => assertDurableApprovalsImmediatelyBeforeExecution");
    expect(submissionServer.indexOf("await input.beforeBroadcast?.()"))
      .toBeLessThan(submissionServer.indexOf("await verifyBroadcastApproval(approvalInput)", submissionServer.indexOf("await input.beforeBroadcast?.()")));
    expect(submissionServer.indexOf("await verifyBroadcastApproval(approvalInput)", submissionServer.indexOf("await input.beforeBroadcast?.()")))
      .toBeLessThan(submissionServer.indexOf("await client.executeContractCall"));
    expect(executeRoute.indexOf("const result = await submitApprovedSettlement")).toBeLessThan(executeRoute.indexOf("const committed = await persistAcceptedExecution"));
  });

  it("freezes both old and new source parents while preserving whole-tab and account cascades", () => {
    expect(migration).toContain("where t.id in (old_tab, new_tab) and t.status <> 'open'");
    expect(migration).toContain("where f.tab_id in (old_tab, new_tab)");
    expect(migration).toContain("tg_table_name = 'receipt_items'");
    expect(migration).toContain("old.receipt_id");
    expect(migration).toContain("new.receipt_id");
    expect(migration.match(/on delete no action deferrable initially deferred/g)).toHaveLength(4);
    expect(migration).toContain("agent_run_id uuid unique references public.settlement_agent_runs(id) on delete set null");
    expect(migration).toContain("tg_op = 'DELETE' and ((select auth.uid()) is null or pg_trigger_depth() > 1)");
    const tabGuard = migration.slice(
      migration.indexOf("create or replace function private.assert_tab_financial_binding_mutable"),
      migration.indexOf("revoke all on function private.assert_settlement_source_mutable"),
    );
    expect(tabGuard).toContain("old.status <> 'open'");
    expect(tabGuard).not.toContain("new.status <> 'open'");
    expect(migration).toContain("set payer_participant_id = payer_id, status = 'frozen'");
  });

  it("retains shared proof across actor deletion and rejects ordinary deletion of financial tabs", () => {
    expect(migration).toContain("created_by uuid not null");
    expect(migration).not.toContain("created_by uuid not null references auth.users");
    expect(agentMigration).toContain("owner_id uuid not null,");
    const runTable = agentMigration.slice(
      agentMigration.indexOf("create table public.settlement_agent_runs"),
      agentMigration.indexOf("create table public.settlement_agent_events"),
    );
    expect(runTable).not.toContain("owner_id uuid not null references auth.users(id) on delete cascade");
    expect(migration).toContain("agent_run_id_snapshot uuid not null unique");
    expect(migration).toContain("agent_run_snapshot jsonb not null");
    expect(migration).toContain("agent_run_hash text not null");
    expect(migration).toContain("RUN_SNAPSHOT_BINDING_MISMATCH");
    expect(migration).toContain("TAB_FINANCIAL_HISTORY_REQUIRES_SERVICE_ERASURE");
    expect(migration).toContain("(select auth.role()) = 'service_role' or session_user = 'supabase_auth_admin'");
    expect(migration).toContain("old.status <> 'open'");
    expect(migration).toContain("exists (select 1 from public.settlement_flow_records f where f.tab_id = old.id)");
  });

  it("locks and revalidates the exact reviewed source graph before first freeze", () => {
    const tabLock = migration.indexOf("select t.status, t.currency::text into target_tab_status, target_tab_currency");
    const runLock = migration.indexOf("select r.* into run_record");
    const receiptLock = migration.indexOf("perform 1 from public.receipts r");
    const allocationLock = migration.indexOf("perform 1 from public.allocations a");
    const participantLock = migration.indexOf("perform 1 from public.participants p");
    const itemLock = migration.indexOf("perform 1 from public.receipt_items i");
    expect(tabLock).toBeGreaterThan(-1);
    expect(tabLock).toBeLessThan(runLock);
    expect(runLock).toBeLessThan(receiptLock);
    expect(receiptLock).toBeLessThan(allocationLock);
    expect(allocationLock).toBeLessThan(participantLock);
    expect(participantLock).toBeLessThan(itemLock);
    expect(migration).toContain("RUN_RECEIPT_ITEMS_BINDING_MISMATCH");
    expect(migration).toContain("RUN_PARTICIPANT_BINDING_MISMATCH");
    expect(migration).toContain("LEDGER_TRANSFER_BINDING_MISMATCH");
  });

  it("serializes phantom source inserts with the same parent-tab freeze lock", () => {
    const sourceGuard = migration.slice(
      migration.indexOf("create or replace function private.assert_settlement_source_mutable"),
      migration.indexOf("create or replace function private.assert_tab_financial_binding_mutable"),
    );
    const parentLock = sourceGuard.indexOf("where t.id in (old_tab, new_tab)");
    const immutableCheck = sourceGuard.indexOf("where t.id in (old_tab, new_tab) and t.status <> 'open'");
    expect(parentLock).toBeGreaterThan(-1);
    expect(sourceGuard.slice(parentLock, immutableCheck)).toContain("for update;");
    expect(migration).toContain("These locks close the server-read/RPC-write gap");
    expect(migration).toContain("RUN_RECEIPT_ITEMS_BINDING_MISMATCH");
    expect(migration).toContain("RUN_PARTICIPANT_BINDING_MISMATCH");
  });

  it("uses NULL-safe, exact proof guards for success and failure", () => {
    expect(migration).toContain("coalesce(receipt ->> 'hash', '') !~*");
    expect(migration).toContain("proof_record ->> 'executionId' is distinct from flow.execution_id");
    expect(migration).toContain("keeperhub_status_record ->> 'executionId' is distinct from flow.execution_id");
    expect(migration).toContain("proof_record #>> '{independent,verified}' is distinct from 'true'");
    expect(migration).toContain("keeperhub_status_record ->> 'status' is null");
    expect(migration).toContain("UNVERIFIED_STATE_REQUIRES_COMPLETED_PROVIDER_STATUS");
    expect(server).toContain("settlementObservationTarget(status, verdict, independent)");
    expect(migration).toContain("receipt ->> 'receiptStatus' in ('reverted', 'safe_inner_failure')");
    expect(migration).toContain("jsonb_array_length(keeperhub_status_record -> 'receipts') > 20");
  });

  it("allows bounded no-broadcast proof promotion for the same terminal execution", () => {
    expect(migration).toContain("create or replace function public.reconcile_reviewed_settlement_proof");
    expect(migration).toContain("flow.state not in ('completed_unverified', 'timeout')");
    expect(migration).toContain("expected_revision <> 5");
    expect(migration).toContain("FLOW_RECONCILIATION_MISMATCH");
    expect(migration).toContain("'reconciled',");
    expect(statusRoute).toContain("promoteDurableSettlementProof");
    expect(statusRoute).toContain('reconciled: true');
    expect(statusRoute).not.toContain("submitApprovedSettlement");
  });

  it("type-checks JSON arrays before every bounded length or iteration guard", () => {
    const transferType = migration.indexOf("jsonb_typeof(transfer_rows) is distinct from 'array'");
    const transferLength = migration.indexOf("jsonb_array_length(transfer_rows) < 1");
    expect(migration.slice(transferType, transferLength)).toContain("then raise exception 'invalid or unbounded frozen ledger'");

    const approvalsType = migration.indexOf("jsonb_typeof(signed_approvals) is distinct from 'array'");
    const approvalsLength = migration.indexOf("jsonb_array_length(signed_approvals) < 1");
    expect(migration.slice(approvalsType, approvalsLength)).toContain("then raise exception 'only a successful bounded exact simulation may be recorded'");

    const verifiedBlock = migration.slice(
      migration.indexOf("if target_state = 'verified_settled' then"),
      migration.indexOf("if target_state = 'failed'"),
    );
    expect(verifiedBlock.indexOf("jsonb_typeof(keeperhub_status_record -> 'receipts') is distinct from 'array'")).toBeLessThan(
      verifiedBlock.indexOf("jsonb_array_length(keeperhub_status_record -> 'receipts') < 1"),
    );
    expect(verifiedBlock).toContain("raise exception 'VERIFIED_STATE_REQUIRES_EXACT_CHAIN_PROOF'");
  });

  it("keeps all first-party provider calls scoped, rate-limited, bounded and same-origin", () => {
    expect(historyRoute).toContain('scope: "tabs:read"');
    for (const route of [freezeRoute, simulateRoute, executeRoute, statusRoute]) {
      expect(route).toContain("rejectCrossOriginMutation(request)");
      expect(route).toContain("authorizeApiRequest(request");
      expect(route).toContain("rateWindowMs: 60_000");
      expect(route).toContain("access.principal.subject !== auth.user.id");
    }
    for (const route of [freezeRoute, simulateRoute, executeRoute, statusRoute]) {
      expect(route).toContain("createAdminSupabaseClient");
      expect(route).toContain("SETTLEMENT_PERSISTENCE_NOT_CONFIGURED");
    }
    expect(simulateRoute.indexOf("const mutationClient = createAdminSupabaseClient()")).toBeLessThan(simulateRoute.indexOf("await simulateSignedSettlement"));
    expect(executeRoute.indexOf("const mutationClient = createAdminSupabaseClient()")).toBeLessThan(executeRoute.indexOf("const result = await submitApprovedSettlement"));
    expect(statusRoute.indexOf("const mutationClient = createAdminSupabaseClient()")).toBeLessThan(statusRoute.indexOf("await client.getStatus"));
  });

  it("returns refresh-safe summaries without raw authorization signatures", () => {
    expect(historyRoute).toContain("listDurableSettlementFlows");
    expect(historyRoute).not.toContain("usdc_authorization");
    expect(historyRoute).not.toContain("consent_signature");
    expect(server).toContain("proofVerified");
    expect(server).toContain("receiptCount");
  });
});
