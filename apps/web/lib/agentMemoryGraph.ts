import type {
  SettlementAgentEvent,
  SettlementAgentMemory,
  SettlementAgentRunDetail,
  SettlementAgentStage,
} from "@/lib/agentControl";

export const AGENT_GRAPH_STAGE_LABELS: Record<SettlementAgentStage, string> = {
  extraction_validation: "Extraction",
  allocation_arithmetic: "Allocation",
  consent_risk: "Consent risk",
  proof_verification: "Proof readiness",
};

interface GraphNodeBase {
  id: string;
  label: string;
  status: string;
  href: string;
}

export interface AgentInputGraphNode extends GraphNodeBase {
  kind: "input";
  inputHash: string;
}

export interface AgentStageGraphNode extends GraphNodeBase {
  kind: "stage";
  event: SettlementAgentEvent;
}

export interface AgentEvidenceGraphNode extends GraphNodeBase {
  kind: "evidence";
  terminalCode: string | null;
  completedAt: string | null;
}

export interface AgentMemoryGraphNode extends GraphNodeBase {
  kind: "memory";
  records: SettlementAgentMemory[];
}

export type AgentMemoryGraphNodeModel =
  | AgentInputGraphNode
  | AgentStageGraphNode
  | AgentEvidenceGraphNode
  | AgentMemoryGraphNode;

export interface AgentMemoryGraphEdge {
  from: string;
  to: string;
}

export interface AgentMemoryGraphModel {
  runId: string | null;
  nodes: AgentMemoryGraphNodeModel[];
  edges: AgentMemoryGraphEdge[];
  eventCount: number;
  memoryCount: number;
}

function runHref(runId: string): string {
  return `/app/agents/${encodeURIComponent(runId)}`;
}

export function buildAgentMemoryGraph(run: SettlementAgentRunDetail | null): AgentMemoryGraphModel {
  if (!run) {
    return { runId: null, nodes: [], edges: [], eventCount: 0, memoryCount: 0 };
  }

  const href = runHref(run.id);
  const events = [...run.events].sort((left, right) =>
    left.sequence - right.sequence || left.id.localeCompare(right.id),
  );
  const memories = [...run.memory].sort((left, right) =>
    right.revision - left.revision || right.updatedAt.localeCompare(left.updatedAt),
  );

  const nodes: AgentMemoryGraphNodeModel[] = [
    {
      id: `input:${run.id}`,
      kind: "input",
      label: "Reviewed input",
      status: run.status,
      href,
      inputHash: run.inputHash,
    },
    ...events.map((event): AgentStageGraphNode => ({
      id: `event:${event.id}`,
      kind: "stage",
      label: AGENT_GRAPH_STAGE_LABELS[event.stage],
      status: event.status,
      href,
      event,
    })),
    {
      id: `evidence:${run.id}`,
      kind: "evidence",
      label: "Run evidence",
      status: run.status,
      href,
      terminalCode: run.terminalCode,
      completedAt: run.completedAt,
    },
  ];

  if (memories.length > 0) {
    nodes.push({
      id: `memory:${run.id}`,
      kind: "memory",
      label: "Bounded memory",
      status: "retained",
      href,
      records: memories,
    });
  }

  return {
    runId: run.id,
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      from: nodes[index]!.id,
      to: node.id,
    })),
    eventCount: events.length,
    memoryCount: memories.length,
  };
}
