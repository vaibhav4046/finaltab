import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentControlInternals } from "@/lib/server/agentControl";

const SECRET = "unit-test-only-agent-attestation-secret-48-bytes";
const RUN_ID = "00000000-0000-4000-8000-000000000101";
const OWNER_ID = "00000000-0000-4000-8000-000000000102";
const TAB_ID = "00000000-0000-4000-8000-000000000103";
const INPUT_HASH = "a".repeat(64);
const ATTESTED_AT = "2026-08-11T05:00:00.123Z";

function activeRun() {
  const row = {
    id: RUN_ID,
    owner_id: OWNER_ID,
    tab_id: TAB_ID,
    input_hash: INPUT_HASH,
    chain_adapter: "base-sepolia",
    status: "running",
    stage_count: 0,
    model_provider: null,
    model_name: null,
    model_usage: {},
    model_cost_microusd: null,
    result_summary: {},
    terminal_code: null,
    attested_at: ATTESTED_AT,
    attestation: "",
    started_at: ATTESTED_AT,
    completed_at: null,
    created_at: ATTESTED_AT,
    updated_at: ATTESTED_AT,
  };
  row.attestation = agentControlInternals.signAttestation(
    agentControlInternals.activeRunAttestationPayload({
      runId: row.id,
      ownerId: row.owner_id,
      tabId: row.tab_id,
      inputHash: row.input_hash,
      status: "running",
      stageCount: row.stage_count,
      modelProvider: row.model_provider,
      modelName: row.model_name,
      modelUsage: row.model_usage,
      modelCostMicrousd: null,
      attestedAt: row.attested_at,
    }),
  );
  return row;
}

beforeEach(() => {
  process.env.FINALTAB_AGENT_ATTESTATION_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.FINALTAB_AGENT_ATTESTATION_SECRET;
});

describe("settlement-agent server provenance", () => {
  it("bounds advisory allocation fan-out before orchestration", () => {
    const proposal = {
      payerId: "participant-a",
      allocations: Array.from({ length: 101 }, (_, itemIndex) => ({
        itemIndex,
        participants: ["participant-a"],
      })),
    };
    expect(agentControlInternals.BoundedAllocationProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("accepts the exact active envelope and rejects direct-RPC progress forgery", () => {
    const row = activeRun();
    expect(agentControlInternals.runRowIsAttested(row as never)).toBe(true);
    expect(agentControlInternals.runRowIsAttested({ ...row, stage_count: 1 } as never)).toBe(false);
    expect(agentControlInternals.runRowIsAttested({ ...row, status: "pending" } as never)).toBe(false);
    expect(agentControlInternals.runRowIsAttested({ ...row, model_provider: "forged" } as never)).toBe(false);
    expect(agentControlInternals.runRowIsAttested({ ...row, owner_id: "00000000-0000-4000-8000-000000000999" } as never)).toBe(false);
  });

  it("binds terminal status, output digest and provider usage", () => {
    const row = {
      ...activeRun(),
      status: "ready",
      stage_count: 4,
      model_provider: "groq",
      model_name: "bounded-model",
      model_usage: { promptTokens: 140, totalTokens: 180, completionTokens: 40 },
      result_summary: { invariants: { allocationConservation: true }, balanceSheet: [] },
      terminal_code: "READY_FOR_SIGNATURES",
      completed_at: "2026-08-11T05:00:02.000Z",
    };
    row.attestation = agentControlInternals.signAttestation(
      agentControlInternals.terminalRunAttestationPayload({
        runId: row.id,
        ownerId: row.owner_id,
        tabId: row.tab_id,
        inputHash: row.input_hash,
        status: "ready",
        stageCount: 4,
        resultSummary: row.result_summary,
        terminalCode: row.terminal_code,
        modelProvider: row.model_provider,
        modelName: row.model_name,
        modelUsage: row.model_usage,
        modelCostMicrousd: null,
        attestedAt: row.attested_at,
      }),
    );
    expect(agentControlInternals.runRowIsAttested(row as never)).toBe(true);
    expect(agentControlInternals.runRowIsAttested({ ...row, stage_count: 3 } as never)).toBe(false);
    expect(agentControlInternals.runRowIsAttested({ ...row, status: "verified" } as never)).toBe(false);
    expect(agentControlInternals.runRowIsAttested({ ...row, result_summary: { invariants: {} } } as never)).toBe(false);
    expect(agentControlInternals.runRowIsAttested({ ...row, model_usage: { totalTokens: 1 } } as never)).toBe(false);
  });

  it("binds each stage output, status, model metadata and duration", () => {
    const run = activeRun();
    const row = {
      id: 1,
      run_id: RUN_ID,
      sequence: 2,
      stage: "allocation_arithmetic",
      status: "passed",
      deterministic: true,
      input_hash: "b".repeat(64),
      output_summary: { conservation: true, totalMinor: "5400" },
      model_provider: "groq",
      model_name: "bounded-model",
      model_usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
      model_cost_microusd: null,
      duration_ms: 250,
      attested_at: "2026-08-11T05:00:01.000Z",
      attestation: "",
      created_at: "2026-08-11T05:00:01.000Z",
    };
    row.attestation = agentControlInternals.signAttestation(
      agentControlInternals.eventAttestationPayload({
        run: run as never,
        sequence: row.sequence,
        stage: "allocation_arithmetic",
        status: "passed",
        stageInputHash: row.input_hash,
        output: row.output_summary,
        provider: row.model_provider,
        model: row.model_name,
        usage: row.model_usage,
        costMicrousd: null,
        durationMs: row.duration_ms,
        attestedAt: row.attested_at,
      }),
    );
    expect(agentControlInternals.eventRowIsAttested(run as never, row as never)).toBe(true);
    expect(agentControlInternals.eventRowIsAttested(run as never, { ...row, status: "blocked" } as never)).toBe(false);
    expect(agentControlInternals.eventRowIsAttested(run as never, { ...row, output_summary: { conservation: false } } as never)).toBe(false);
    expect(agentControlInternals.eventRowIsAttested(run as never, { ...row, duration_ms: 1 } as never)).toBe(false);
  });

  it("binds memory revision, source run and expiry so signed RPCs cannot be replayed", () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000104",
      owner_id: OWNER_ID,
      tab_id: TAB_ID,
      source_run_id: RUN_ID,
      memory_key: "latest.settlement_review",
      content_hash: "c".repeat(64),
      summary: { invariants: { receiptArithmetic: true } },
      revision: 1,
      expires_at: "2027-02-06T05:00:00.000Z",
      attested_at: ATTESTED_AT,
      attestation: "",
      created_at: ATTESTED_AT,
      updated_at: ATTESTED_AT,
    };
    row.attestation = agentControlInternals.signAttestation(
      agentControlInternals.memoryAttestationPayload({
        ownerId: row.owner_id,
        tabId: row.tab_id,
        sourceRunId: row.source_run_id,
        memoryKey: row.memory_key,
        contentHash: row.content_hash,
        summary: row.summary,
        revision: row.revision,
        expiresAt: row.expires_at,
        attestedAt: row.attested_at,
      }),
    );
    expect(agentControlInternals.memoryRowIsAttested(row as never)).toBe(true);
    expect(agentControlInternals.memoryRowIsAttested({ ...row, revision: 2 } as never)).toBe(false);
    expect(agentControlInternals.memoryRowIsAttested({ ...row, source_run_id: null } as never)).toBe(false);
    expect(agentControlInternals.memoryRowIsAttested({ ...row, expires_at: "2027-02-05T05:00:00.000Z" } as never)).toBe(false);
  });

  it("fails closed when the server-only attestation secret is absent", () => {
    delete process.env.FINALTAB_AGENT_ATTESTATION_SECRET;
    expect(() => agentControlInternals.runRowIsAttested(activeRun() as never)).toThrow("AGENT_ATTESTATION_NOT_CONFIGURED");
  });

  it("repairs missing terminal memory without rolling a newer compact summary backwards", () => {
    const terminalRun = {
      id: RUN_ID,
      ownerId: OWNER_ID,
      tabId: TAB_ID,
      inputHash: INPUT_HASH,
      chainAdapter: "base-sepolia",
      status: "ready",
      stageCount: 4,
      modelProvider: null,
      modelName: null,
      modelUsage: {},
      modelCostMicrousd: null,
      resultSummary: { merchant: "Current", invariants: {}, balanceSheet: [] },
      terminalCode: "READY_FOR_SIGNATURES",
      startedAt: ATTESTED_AT,
      completedAt: "2026-08-11T05:00:02.000Z",
      createdAt: ATTESTED_AT,
      updatedAt: "2026-08-11T05:00:02.000Z",
      events: [],
      memory: [],
    };
    expect(agentControlInternals.shouldReplaceLatestMemory(null, terminalRun as never, "d".repeat(64))).toBe(true);

    const prior = {
      id: "00000000-0000-4000-8000-000000000109",
      owner_id: OWNER_ID,
      tab_id: TAB_ID,
      source_run_id: "00000000-0000-4000-8000-000000000110",
      memory_key: "latest.settlement_review",
      content_hash: "e".repeat(64),
      summary: { completedAt: "2026-08-11T05:00:03.000Z" },
      revision: 2,
      expires_at: "2027-02-06T05:00:00.000Z",
      attested_at: ATTESTED_AT,
      attestation: "",
      created_at: ATTESTED_AT,
      updated_at: ATTESTED_AT,
    };
    prior.attestation = agentControlInternals.signAttestation(agentControlInternals.memoryAttestationPayload({
      ownerId: prior.owner_id,
      tabId: prior.tab_id,
      sourceRunId: prior.source_run_id,
      memoryKey: prior.memory_key,
      contentHash: prior.content_hash,
      summary: prior.summary,
      revision: prior.revision,
      expiresAt: prior.expires_at,
      attestedAt: prior.attested_at,
    }));
    expect(agentControlInternals.shouldReplaceLatestMemory(prior as never, terminalRun as never, "d".repeat(64))).toBe(false);
    expect(agentControlInternals.shouldReplaceLatestMemory(
      { ...prior, summary: { completedAt: "2026-08-11T05:00:01.000Z" }, attestation: "invalid" } as never,
      terminalRun as never,
      "d".repeat(64),
    )).toBe(true);
  });
});

describe("settlement-agent database and route boundary", () => {
  const migration = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/20260811052236_settlement_agent_control_plane.sql", import.meta.url)),
    "utf8",
  );
  const server = readFileSync(
    fileURLToPath(new URL("../lib/server/agentControl.ts", import.meta.url)),
    "utf8",
  );

  it("keeps truth tables read-only and owner-scoped under RLS", () => {
    expect(migration.match(/enable row level security/g)).toHaveLength(3);
    expect(migration).toContain("owner_id = (select auth.uid()) and private.is_tab_member(tab_id)");
    expect(migration).toContain("owner_id = (select auth.uid()) and private.can_edit_tab(tab_id)");
    expect(migration).toContain("revoke all on public.settlement_agent_runs, public.settlement_agent_events");
    expect(migration).not.toMatch(/grant\s+(insert|update).*settlement_agent_(runs|events|memory)/i);
    expect(migration).toContain("grant select on public.settlement_agent_runs to authenticated");
    expect(migration).toContain("grant select, delete on public.settlement_agent_memory to authenticated");
    expect(migration).toContain("and expires_at > now()");
  });

  it("physically expires bounded owner memory without blocking account or tab cascades", () => {
    expect(migration).toContain("create or replace function public.delete_expired_settlement_agent_memory()");
    expect(migration).toContain("where m.owner_id = caller and m.expires_at <= now()");
    expect(migration).toContain("limit 100");
    expect(migration).toContain("tg_op = 'DELETE' and (pg_trigger_depth() > 1 or (caller is null and caller_role is distinct from 'service_role'))");
    expect(migration).toContain("caller := row_owner");
    expect(migration).toContain("grant execute on function public.delete_expired_settlement_agent_memory() to authenticated");
    expect(server).toContain('client.rpc("delete_expired_settlement_agent_memory")');
    const detailQuery = server.slice(server.indexOf("export async function getSettlementAgentRun"), server.indexOf("export async function getSettlementAgentPersistenceContext"));
    expect(detailQuery).toContain('.gt("expires_at", new Date().toISOString())');
  });

  it("revokes public RPC access and validates auth, order, bounds and durable evidence", () => {
    expect(migration.match(/revoke all on function public\.(begin|record|finish|remember)_settlement_agent_/g)).toHaveLength(4);
    expect(migration.match(/service role required/g)).toHaveLength(4);
    expect(migration.match(/\) to service_role;/g)).toHaveLength(4);
    expect(migration).toContain("caller uuid := expected_owner");
    expect(migration).toContain("private.user_can_edit_agent_tab(caller");
    expect(migration).toContain("target_sequence <> run_record.stage_count + 1");
    expect(migration).toContain("passed extraction stage requires a confirmed, arithmetic-clean receipt record");
    expect(migration).toContain("passed allocation stage requires a durable conserved allocation");
    expect(migration).toContain("passed proof stage requires a durable verified Base Sepolia settlement");
  });

  it("leases identical active runs and replaces crashed or failed attempts", () => {
    expect(migration).toContain("for update;");
    expect(migration).toContain("created.updated_at >= now() - interval '2 minutes'");
    expect(migration).toContain("created.status in ('ready', 'verified', 'blocked')");
    expect(migration).toContain("delete from public.settlement_agent_runs where id = created.id");
  });

  it("repairs a missing compact memory row on terminal content-hash dedupe", () => {
    const dedupeBranch = server.slice(server.indexOf("if (deduped)"), server.indexOf("const context: RunContext"));
    expect(dedupeBranch).toContain("ensureTerminalRunMemory(client, mutationClient, userId, existing)");
    expect(server).toContain("for (let attempt = 0; attempt < 3; attempt += 1)");
    expect(server).toContain("shouldReplaceLatestMemory");
  });

  it("uses compare-and-swap memory revisions and keeps unverified semantics out of the shared audit feed", () => {
    expect(migration).toContain("requested_revision <> prior_revision + 1");
    expect(migration).toContain("public.settlement_agent_memory.revision = excluded.revision - 1");
    const auditFunction = migration.slice(
      migration.indexOf("create or replace function private.audit_settlement_agent_change"),
      migration.indexOf("revoke all on function private.validate_settlement_agent_run_transition"),
    );
    expect(auditFunction).toContain("agent.attestation.received");
    expect(auditFunction).toContain("requires_server_attestation");
    expect(auditFunction).not.toContain("'status'");
    expect(auditFunction).not.toContain("'stage_count'");
    expect(auditFunction).not.toContain("'model_provider'");
  });

  it("never treats an older proof on the same tab as evidence for a new allocation", () => {
    expect(server).toContain('code: upstreamPassed ? "SETTLEMENT_NOT_SUBMITTED"');
    expect(server).toContain("exactBindingRequired: true");
    expect(server).not.toContain('.from("settlements")');
    expect(server).not.toContain("latestProofCandidate");
  });

  it("creates an addressable authenticated run with bounded, same-origin mutation", () => {
    const route = readFileSync(
      fileURLToPath(new URL("../app/api/agents/runs/route.ts", import.meta.url)),
      "utf8",
    );
    expect(route).toContain("const MAX_RUN_BODY_BYTES = 96 * 1024");
    expect(route).toContain("rejectCrossOriginMutation(request)");
    expect(route.match(/requireCloudUser\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route).toContain("createAdminSupabaseClient");
    expect(route).toContain("SETTLEMENT_PERSISTENCE_NOT_CONFIGURED");
    expect(route).toContain("runUrl: `/app/agents/${encodeURIComponent(result.run.id)}`");
  });
});
