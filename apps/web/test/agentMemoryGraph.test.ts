import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  SettlementAgentEvent,
  SettlementAgentMemory,
  SettlementAgentRunDetail,
  SettlementAgentStage,
  SettlementLineageFlow,
} from "@/lib/agentControl";
import { buildAgentMemoryGraph } from "@/lib/agentMemoryGraph";

const RUN_ID = "00000000-0000-4000-8000-000000000201";
const CREATED_AT = "2026-08-12T09:00:00.000Z";

function event(sequence: number, stage: SettlementAgentStage): SettlementAgentEvent {
  return {
    id: `event-${sequence}`,
    runId: RUN_ID,
    sequence,
    stage,
    status: stage === "proof_verification" ? "skipped" : "passed",
    deterministic: stage !== "allocation_arithmetic",
    inputHash: String(sequence).repeat(64),
    outputSummary: { sequence },
    modelProvider: stage === "allocation_arithmetic" ? "groq" : null,
    modelName: stage === "allocation_arithmetic" ? "recorded-model" : null,
    modelUsage: {},
    modelCostMicrousd: null,
    durationMs: sequence * 100,
    createdAt: CREATED_AT,
  };
}

function memory(id: string, revision: number): SettlementAgentMemory {
  return {
    id,
    tabId: "00000000-0000-4000-8000-000000000202",
    sourceRunId: RUN_ID,
    memoryKey: "latest.settlement_review",
    contentHash: String(revision).repeat(64),
    summary: { runId: RUN_ID },
    revision,
    expiresAt: "2027-02-08T09:00:00.000Z",
    createdAt: CREATED_AT,
    updatedAt: `2026-08-12T09:00:0${revision}.000Z`,
  };
}

function detail(overrides: Partial<SettlementAgentRunDetail> = {}): SettlementAgentRunDetail {
  return {
    id: RUN_ID,
    ownerId: "00000000-0000-4000-8000-000000000203",
    tabId: "00000000-0000-4000-8000-000000000202",
    inputHash: "a".repeat(64),
    chainAdapter: "base-sepolia",
    status: "ready",
    stageCount: 4,
    modelProvider: "groq",
    modelName: "recorded-model",
    modelUsage: {},
    modelCostMicrousd: null,
    resultSummary: {},
    terminalCode: "READY_FOR_SIGNATURES",
    startedAt: CREATED_AT,
    completedAt: "2026-08-12T09:00:04.000Z",
    createdAt: CREATED_AT,
    updatedAt: "2026-08-12T09:00:04.000Z",
    events: [
      event(3, "consent_risk"),
      event(1, "extraction_validation"),
      event(4, "proof_verification"),
      event(2, "allocation_arithmetic"),
    ],
    memory: [memory("memory-1", 1), memory("memory-2", 2)],
    ...overrides,
  };
}

function flow(overrides: Partial<SettlementLineageFlow> = {}): SettlementLineageFlow {
  return {
    id: "00000000-0000-4000-8000-000000000301",
    runId: RUN_ID,
    ledgerId: "00000000-0000-4000-8000-000000000302",
    settlementRecordId: "00000000-0000-4000-8000-000000000303",
    ledgerHash: "b".repeat(64),
    settlementId: `0x${"c".repeat(64)}`,
    chainId: 84532,
    contractAddress: "0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB",
    state: "verified_settled",
    revision: 5,
    signedBodyHash: "d".repeat(64),
    simulationHash: "e".repeat(64),
    executionId: "execution-1",
    executionHash: "f".repeat(64),
    proofVerified: true,
    receiptCount: 2,
    proofCheckedAt: "2026-08-12T09:05:00.000Z",
    createdAt: CREATED_AT,
    updatedAt: "2026-08-12T09:05:00.000Z",
    events: [
      { revision: 1, kind: "frozen", state: "frozen", createdAt: "2026-08-12T09:01:00.000Z" },
      { revision: 2, kind: "simulated", state: "simulated", createdAt: "2026-08-12T09:02:00.000Z" },
      { revision: 3, kind: "submitted", state: "submitted", createdAt: "2026-08-12T09:03:00.000Z" },
      { revision: 4, kind: "terminal", state: "completed_unverified", createdAt: "2026-08-12T09:04:00.000Z" },
      { revision: 5, kind: "reconciled", state: "verified_settled", createdAt: "2026-08-12T09:05:00.000Z" },
    ],
    ...overrides,
  };
}

describe("agent memory graph", () => {
  it("orders the full lineage from reviewed input through settlement to bounded memory", () => {
    const graph = buildAgentMemoryGraph(detail(), flow());

    expect(graph.runId).toBe(RUN_ID);
    expect(graph.eventCount).toBe(4);
    expect(graph.memoryCount).toBe(2);
    expect(graph.nodes.map((node) => [node.kind, node.label, node.status])).toEqual([
      ["input", "Reviewed input", "ready"],
      ["stage", "Extraction", "passed"],
      ["stage", "Allocation", "passed"],
      ["stage", "Consent risk", "passed"],
      ["stage", "Proof readiness", "skipped"],
      ["evidence", "Run evidence", "ready"],
      ["settlement", "Frozen ledger", "frozen"],
      ["settlement", "Wallet consent", "signed"],
      ["settlement", "Simulation", "simulated"],
      ["settlement", "Broadcast approval", "approved"],
      ["settlement", "KeeperHub execution", "executed"],
      ["settlement", "Chain verification", "verified"],
      ["memory", "Bounded memory", "retained"],
    ]);
    expect(graph.recordedCount).toBe(13);
    expect(graph.missingCount).toBe(0);
    expect(graph.edges).toEqual(graph.nodes.slice(1).map((node, index) => ({
      from: graph.nodes[index]!.id,
      to: node.id,
    })));
  });

  it("labels each node with the class of evidence it stands on", () => {
    const graph = buildAgentMemoryGraph(detail(), flow());

    expect(graph.nodes.map((node) => node.provenance)).toEqual([
      "deterministic",
      "deterministic",
      "model",
      "deterministic",
      "deterministic",
      "model",
      "deterministic",
      "human_wallet",
      "deterministic",
      "human_wallet",
      "keeperhub",
      "onchain",
      "memory",
    ]);
  });

  it("carries the settlement identifiers a reader needs to check the chain independently", () => {
    const graph = buildAgentMemoryGraph(detail(), flow());
    const frozen = graph.nodes.find((node) => node.kind === "settlement" && node.stage === "frozen_ledger");
    const verification = graph.nodes.find((node) => node.kind === "settlement" && node.stage === "chain_verification");

    expect(frozen?.facts).toEqual([
      { label: "Settlement id", value: `0x${"c".repeat(64)}`, format: "hash" },
      { label: "Ledger hash", value: "b".repeat(64), format: "hash" },
      { label: "Contract", value: "0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB", format: "hash" },
      { label: "Chain", value: "84532", format: "text" },
      { label: "Frozen", value: "2026-08-12T09:01:00.000Z", format: "time" },
    ]);
    expect(verification?.facts).toEqual([
      { label: "Independent check", value: "verified", format: "text" },
      { label: "Receipts", value: "2", format: "text" },
      { label: "Checked", value: "2026-08-12T09:05:00.000Z", format: "time" },
    ]);
  });

  it("orders memory records newest revision first and keeps their source run", () => {
    const graph = buildAgentMemoryGraph(detail(), flow());
    const memoryNode = graph.nodes.at(-1);

    expect(memoryNode?.kind).toBe("memory");
    if (memoryNode?.kind === "memory") {
      expect(memoryNode.records.map((record) => record.id)).toEqual(["memory-2", "memory-1"]);
      expect(memoryNode.records.map((record) => record.sourceRunId)).toEqual([RUN_ID, RUN_ID]);
      expect(memoryNode.facts).toEqual([{ label: "Active records", value: "2", format: "text" }]);
    }
  });

  it("does not invent stages the run never recorded", () => {
    const graph = buildAgentMemoryGraph(detail({
      status: "blocked",
      stageCount: 2,
      terminalCode: "CONSENT_RISK_BLOCKED",
      events: [event(1, "extraction_validation"), event(3, "consent_risk")],
      memory: [],
    }));

    expect(graph.nodes.filter((node) => node.kind === "stage").map((node) => node.label)).toEqual([
      "Extraction",
      "Consent risk",
    ]);
  });

  it("keeps unproven settlement and memory steps visible as missing instead of dropping them", () => {
    const graph = buildAgentMemoryGraph(detail({ memory: [] }), null);

    expect(graph.nodes.filter((node) => !node.recorded).map((node) => [node.label, node.status])).toEqual([
      ["Frozen ledger", "missing"],
      ["Wallet consent", "missing"],
      ["Simulation", "missing"],
      ["Broadcast approval", "missing"],
      ["KeeperHub execution", "missing"],
      ["Chain verification", "missing"],
      ["Bounded memory", "missing"],
    ]);
    expect(graph.memoryCount).toBe(0);
    expect(graph.recordedCount).toBe(6);
    expect(graph.missingCount).toBe(7);
    expect(graph.nodes.every((node) => node.recorded || node.facts.length === 0)).toBe(true);
  });

  it("marks partial settlement evidence as missing rather than filling the gap", () => {
    const graph = buildAgentMemoryGraph(
      detail(),
      flow({
        state: "frozen",
        revision: 1,
        signedBodyHash: null,
        simulationHash: null,
        executionId: null,
        executionHash: null,
        proofVerified: false,
        receiptCount: 0,
        proofCheckedAt: null,
        events: [{ revision: 1, kind: "frozen", state: "frozen", createdAt: "2026-08-12T09:01:00.000Z" }],
      }),
    );

    expect(graph.nodes.filter((node) => node.kind === "settlement").map((node) => [node.label, node.status])).toEqual([
      ["Frozen ledger", "frozen"],
      ["Wallet consent", "missing"],
      ["Simulation", "missing"],
      ["Broadcast approval", "missing"],
      ["KeeperHub execution", "missing"],
      ["Chain verification", "missing"],
    ]);
  });

  it("reports a failed or timed-out execution instead of an executed one", () => {
    const failed = buildAgentMemoryGraph(detail(), flow({ state: "failed", executionId: null }));
    const timedOut = buildAgentMemoryGraph(detail(), flow({ state: "timeout" }));

    const failedExecution = failed.nodes.find((node) => node.kind === "settlement" && node.stage === "keeperhub_execution");
    expect(failedExecution?.recorded).toBe(true);
    expect(failedExecution?.status).toBe("failed");
    expect(failedExecution?.facts).toEqual([
      { label: "Execution digest", value: "f".repeat(64), format: "hash" },
      { label: "Flow state", value: "failed", format: "text" },
    ]);

    const timedOutExecution = timedOut.nodes.find((node) => node.kind === "settlement" && node.stage === "keeperhub_execution");
    expect(timedOutExecution?.status).toBe("timeout");
  });

  it("does not claim an onchain check succeeded when the recorded check did not verify", () => {
    const graph = buildAgentMemoryGraph(
      detail(),
      flow({ state: "completed_unverified", proofVerified: false, receiptCount: 0 }),
    );
    const verification = graph.nodes.find((node) => node.kind === "settlement" && node.stage === "chain_verification");

    expect(verification?.status).toBe("unverified");
    expect(verification?.facts).toContainEqual({ label: "Independent check", value: "not verified", format: "text" });
  });

  it("ignores settlement evidence that belongs to a different run", () => {
    const graph = buildAgentMemoryGraph(detail(), flow({ runId: "00000000-0000-4000-8000-0000000009ff" }));

    expect(graph.nodes.filter((node) => node.kind === "settlement").every((node) => node.recorded)).toBe(false);
    expect(graph.nodes.filter((node) => node.kind === "settlement").map((node) => node.status)).toEqual([
      "missing",
      "missing",
      "missing",
      "missing",
      "missing",
      "missing",
    ]);
  });

  it("returns a truthful empty model when no run detail is loaded", () => {
    expect(buildAgentMemoryGraph(null)).toEqual({
      runId: null,
      nodes: [],
      edges: [],
      eventCount: 0,
      memoryCount: 0,
      recordedCount: 0,
      missingCount: 0,
    });
  });

  it("wraps the complete lineage at every width instead of scrolling it sideways", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/AgentMemoryGraph.tsx", import.meta.url)), "utf8");

    expect(source).toContain("@container");
    expect(source).toContain("@min-[640px]:grid-cols-2");
    expect(source).toContain("@min-[1000px]:grid-cols-3");
    expect(source).toContain("@min-[1400px]:grid-cols-4");
    expect(source).toContain("@min-[640px]:before:hidden");
    expect(source).not.toContain("grid-flow-col");
    expect(source).not.toContain("overflow-x");
    expect(source).not.toContain("lg:min-w-max");
    expect(source).not.toContain("Scrollable run evidence graph");
  });

  it("sizes the columns from the container, not the viewport", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/AgentMemoryGraph.tsx", import.meta.url)), "utf8");
    const grid = source.match(/className="grid gap-3[^"]*"/);

    expect(grid).not.toBeNull();
    // The page shell caps this section, so a viewport query keeps adding columns
    // to a container that has stopped growing and the cards shrink as the screen
    // grows. Named breakpoints and bare `min-[…]` are both viewport queries.
    expect(grid?.[0]).not.toMatch(/\b(sm|md|lg|xl|2xl):grid-cols-/);
    expect(grid?.[0]).not.toMatch(/(^|[^@])min-\[\d+px\]:grid-cols-/);

    const steps = [...grid![0].matchAll(/@min-\[(\d+)px\]:grid-cols-(\d+)/g)].map((match) => ({
      width: Number(match[1]),
      columns: Number(match[2]),
    }));

    expect(steps.length).toBeGreaterThanOrEqual(3);
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index].width).toBeGreaterThan(steps[index - 1].width);
      expect(steps[index].columns).toBeGreaterThan(steps[index - 1].columns);
    }
    // The shell caps the container near 1686px, so a wider step could never be
    // reached and therefore could never be verified.
    expect(steps[steps.length - 1].width).toBeLessThan(1686);
  });

  it("links out once per destination instead of once per node", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/AgentMemoryGraph.tsx", import.meta.url)), "utf8");
    const list = source.match(/<ol[\s\S]*?<\/ol>/);

    expect(list).not.toBeNull();
    // Every node of a graph belongs to the same run, so a link per node was the
    // same href thirteen times over, all reading "Inspect run evidence".
    expect(list?.[0]).not.toContain("<Link");
    expect(source).not.toContain("Inspect run evidence");
    // ...and neither the section link nor a memory link points at the page the
    // reader is already on.
    expect(source).toContain("graph.runId !== viewingRunId");
    expect(source).toContain("record.sourceRunId !== runId");
  });

  it("carries no per-node link target in the model", () => {
    const graph = buildAgentMemoryGraph(detail(), flow());

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.filter((node) => "href" in node)).toEqual([]);
  });

  it("renders missing evidence as missing and full digests as selectable text", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/AgentMemoryGraph.tsx", import.meta.url)), "utf8");

    expect(source).toContain("No evidence recorded for this step.");
    expect(source).toContain("select-all break-all");
    expect(source).toContain("aria-label={`Step ${index + 1} of ${graph.nodes.length}");
  });
});
