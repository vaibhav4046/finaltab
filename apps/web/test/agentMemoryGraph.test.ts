import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  SettlementAgentEvent,
  SettlementAgentMemory,
  SettlementAgentRunDetail,
  SettlementAgentStage,
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

describe("agent memory graph", () => {
  it("orders only the loaded events between the run input and evidence, then attaches loaded memory", () => {
    const graph = buildAgentMemoryGraph(detail());

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
      ["memory", "Bounded memory", "retained"],
    ]);
    expect(graph.edges).toEqual(graph.nodes.slice(1).map((node, index) => ({
      from: graph.nodes[index]!.id,
      to: node.id,
    })));
    const memoryNode = graph.nodes.at(-1);
    expect(memoryNode?.kind).toBe("memory");
    if (memoryNode?.kind === "memory") {
      expect(memoryNode.records.map((record) => record.id)).toEqual(["memory-2", "memory-1"]);
    }
  });

  it("does not invent missing stages or a memory node", () => {
    const run = detail({
      status: "blocked",
      stageCount: 2,
      terminalCode: "CONSENT_RISK_BLOCKED",
      events: [event(1, "extraction_validation"), event(3, "consent_risk")],
      memory: [],
    });
    const graph = buildAgentMemoryGraph(run);

    expect(graph.nodes.map((node) => node.label)).toEqual([
      "Reviewed input",
      "Extraction",
      "Consent risk",
      "Run evidence",
    ]);
    expect(graph.memoryCount).toBe(0);
    expect(graph.nodes.some((node) => node.kind === "memory")).toBe(false);
  });

  it("returns a truthful empty model when no run detail is loaded", () => {
    expect(buildAgentMemoryGraph(null)).toEqual({
      runId: null,
      nodes: [],
      edges: [],
      eventCount: 0,
      memoryCount: 0,
    });
  });

  it("wraps the complete lineage at ordinary desktop widths", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/AgentMemoryGraph.tsx", import.meta.url)), "utf8");

    expect(source).toContain("md:grid-cols-2 xl:grid-cols-3");
    expect(source).toContain("min-[2200px]:grid-cols-none min-[2200px]:grid-flow-col");
    expect(source).toContain("md:before:hidden");
    expect(source).toContain("min-[2200px]:before:block");
    expect(source).not.toContain("lg:min-w-max lg:grid-flow-col");
    expect(source).not.toContain("Scrollable run evidence graph");
  });
});
