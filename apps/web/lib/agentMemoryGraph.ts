import type {
  SettlementAgentEvent,
  SettlementAgentMemory,
  SettlementAgentRunDetail,
  SettlementAgentStage,
  SettlementLineageEventKind,
  SettlementLineageFlow,
} from "@/lib/agentControl";

export const AGENT_GRAPH_STAGE_LABELS: Record<SettlementAgentStage, string> = {
  extraction_validation: "Extraction",
  allocation_arithmetic: "Allocation",
  consent_risk: "Consent risk",
  proof_verification: "Proof readiness",
};

export const SETTLEMENT_LINEAGE_ORDER = [
  "frozen_ledger",
  "wallet_consent",
  "simulation",
  "broadcast_approval",
  "keeperhub_execution",
  "chain_verification",
] as const;

export type SettlementLineageStage = (typeof SETTLEMENT_LINEAGE_ORDER)[number];

export const SETTLEMENT_LINEAGE_LABELS: Record<SettlementLineageStage, string> = {
  frozen_ledger: "Frozen ledger",
  wallet_consent: "Wallet consent",
  simulation: "Simulation",
  broadcast_approval: "Broadcast approval",
  keeperhub_execution: "KeeperHub execution",
  chain_verification: "Chain verification",
};

/** Who or what produced the evidence a node stands on. */
export type AgentGraphProvenance =
  | "model"
  | "deterministic"
  | "human_wallet"
  | "keeperhub"
  | "onchain"
  | "memory";

export const AGENT_GRAPH_PROVENANCE_LABELS: Record<AgentGraphProvenance, string> = {
  model: "Model",
  deterministic: "Deterministic",
  human_wallet: "Human + wallet",
  keeperhub: "KeeperHub",
  onchain: "Onchain",
  memory: "Memory",
};

export interface AgentGraphFact {
  label: string;
  value: string;
  format: "text" | "hash" | "time";
}

interface GraphNodeBase {
  id: string;
  label: string;
  status: string;
  provenance: AgentGraphProvenance;
  /** False when the service returned no evidence for this step of the lineage. */
  recorded: boolean;
  facts: AgentGraphFact[];
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

export interface AgentSettlementGraphNode extends GraphNodeBase {
  kind: "settlement";
  stage: SettlementLineageStage;
}

export interface AgentMemoryGraphNode extends GraphNodeBase {
  kind: "memory";
  records: SettlementAgentMemory[];
}

export type AgentMemoryGraphNodeModel =
  | AgentInputGraphNode
  | AgentStageGraphNode
  | AgentEvidenceGraphNode
  | AgentSettlementGraphNode
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
  recordedCount: number;
  missingCount: number;
}

const MISSING = "missing";

/**
 * The one page that holds a run's evidence. Every node of a graph belongs to the
 * same run, so the graph links here once rather than per node.
 */
export function agentRunHref(runId: string): string {
  return `/app/agents/${encodeURIComponent(runId)}`;
}

function text(label: string, value: string): AgentGraphFact {
  return { label, value, format: "text" };
}

function hash(label: string, value: string): AgentGraphFact {
  return { label, value, format: "hash" };
}

function time(label: string, value: string): AgentGraphFact {
  return { label, value, format: "time" };
}

function stageFacts(event: SettlementAgentEvent): AgentGraphFact[] {
  return [
    text(
      "Produced by",
      event.modelName
        ? `${event.modelProvider ?? "recorded provider"}/${event.modelName}`
        : event.deterministic ? "Rules only" : "No model recorded",
    ),
    text("Duration", `${event.durationMs.toLocaleString()} ms`),
    hash("Input hash", event.inputHash),
  ];
}

function evidenceFacts(run: SettlementAgentRunDetail): AgentGraphFact[] {
  const facts: AgentGraphFact[] = [text("Terminal code", run.terminalCode ?? "No terminal code recorded")];
  if (run.completedAt) facts.push(time("Completed", run.completedAt));
  return facts;
}

function flowEvent(
  flow: SettlementLineageFlow,
  kind: SettlementLineageEventKind,
): { revision: number; createdAt: string } | null {
  const match = [...flow.events]
    .sort((left, right) => left.revision - right.revision)
    .find((event) => event.kind === kind);
  return match ? { revision: match.revision, createdAt: match.createdAt } : null;
}

/**
 * One settlement node. `recorded: false` means the service returned no evidence
 * for that step, and the node is kept in the chain so the gap is visible rather
 * than hidden. No node is ever synthesised from a value the service did not
 * return.
 */
function settlementNode(
  stage: SettlementLineageStage,
  provenance: AgentGraphProvenance,
  runId: string,
  evidence: { status: string; facts: AgentGraphFact[] } | null,
): AgentSettlementGraphNode {
  return {
    id: `settlement:${stage}:${runId}`,
    kind: "settlement",
    label: SETTLEMENT_LINEAGE_LABELS[stage],
    status: evidence?.status ?? MISSING,
    provenance,
    recorded: evidence !== null,
    facts: evidence?.facts ?? [],
    stage,
  };
}

function executionStatus(flow: SettlementLineageFlow): string {
  if (flow.state === "failed") return "failed";
  if (flow.state === "timeout") return "timeout";
  return "executed";
}

function settlementNodes(
  flow: SettlementLineageFlow | null,
  runId: string,
): AgentSettlementGraphNode[] {
  const frozen = flow ? flowEvent(flow, "frozen") : null;
  const simulated = flow ? flowEvent(flow, "simulated") : null;
  const submitted = flow ? flowEvent(flow, "submitted") : null;
  const executionRecorded = Boolean(flow && (flow.executionId || flow.state === "failed" || flow.state === "timeout"));

  return [
    settlementNode(
      "frozen_ledger",
      "deterministic",
      runId,      flow
        ? {
            status: "frozen",
            facts: [
              hash("Settlement id", flow.settlementId),
              hash("Ledger hash", flow.ledgerHash),
              hash("Contract", flow.contractAddress),
              text("Chain", String(flow.chainId)),
              ...(frozen ? [time("Frozen", frozen.createdAt)] : []),
            ],
          }
        : null,
    ),
    settlementNode(
      "wallet_consent",
      "human_wallet",
      runId,      flow?.signedBodyHash
        ? { status: "signed", facts: [hash("Signed body digest", flow.signedBodyHash)] }
        : null,
    ),
    settlementNode(
      "simulation",
      "deterministic",
      runId,      flow?.simulationHash
        ? {
            status: "simulated",
            facts: [
              hash("Simulation digest", flow.simulationHash),
              ...(simulated ? [time("Simulated", simulated.createdAt)] : []),
            ],
          }
        : null,
    ),
    settlementNode(
      "broadcast_approval",
      "human_wallet",
      runId,      // The approval itself is a short-lived signed grant that is verified and
      // then discarded, so the only durable artifact is the state transition it
      // caused. That is what this node reports, and nothing more.
      submitted
        ? {
            status: "approved",
            facts: [
              text("Evidence", `recorded "submitted" transition at revision ${submitted.revision}`),
              time("Recorded", submitted.createdAt),
            ],
          }
        : null,
    ),
    settlementNode(
      "keeperhub_execution",
      "keeperhub",
      runId,      flow && executionRecorded
        ? {
            status: executionStatus(flow),
            facts: [
              ...(flow.executionId ? [hash("Execution id", flow.executionId)] : []),
              ...(flow.executionHash ? [hash("Execution digest", flow.executionHash)] : []),
              text("Flow state", flow.state),
            ],
          }
        : null,
    ),
    settlementNode(
      "chain_verification",
      "onchain",
      runId,      flow?.proofCheckedAt
        ? {
            status: flow.proofVerified ? "verified" : "unverified",
            facts: [
              text("Independent check", flow.proofVerified ? "verified" : "not verified"),
              text("Receipts", String(flow.receiptCount)),
              time("Checked", flow.proofCheckedAt),
            ],
          }
        : null,
    ),
  ];
}

/**
 * Builds the run's evidence lineage: reviewed input, the recorded review
 * stages, the run's own evidence, the settlement steps that follow it, and the
 * bounded memory it left behind.
 *
 * Every node is derived from what the service actually returned. Steps with no
 * evidence are emitted with `recorded: false` so a gap in the chain stays
 * visible instead of being quietly dropped or filled in.
 */
export function buildAgentMemoryGraph(
  run: SettlementAgentRunDetail | null,
  flow: SettlementLineageFlow | null = null,
): AgentMemoryGraphModel {
  if (!run) {
    return { runId: null, nodes: [], edges: [], eventCount: 0, memoryCount: 0, recordedCount: 0, missingCount: 0 };
  }

  const events = [...run.events].sort((left, right) =>
    left.sequence - right.sequence || left.id.localeCompare(right.id),
  );
  const memories = [...run.memory].sort((left, right) =>
    right.revision - left.revision || right.updatedAt.localeCompare(left.updatedAt),
  );
  // Evidence belonging to a different run is not this run's evidence.
  const runFlow = flow && flow.runId === run.id ? flow : null;

  const nodes: AgentMemoryGraphNodeModel[] = [
    {
      id: `input:${run.id}`,
      kind: "input",
      label: "Reviewed input",
      status: run.status,      provenance: "deterministic",
      recorded: true,
      facts: [hash("Input hash", run.inputHash)],
      inputHash: run.inputHash,
    },
    ...events.map((event): AgentStageGraphNode => ({
      id: `event:${event.id}`,
      kind: "stage",
      label: AGENT_GRAPH_STAGE_LABELS[event.stage],
      status: event.status,      provenance: event.deterministic ? "deterministic" : "model",
      recorded: true,
      facts: stageFacts(event),
      event,
    })),
    {
      id: `evidence:${run.id}`,
      kind: "evidence",
      label: "Run evidence",
      status: run.status,      provenance: run.modelName ? "model" : "deterministic",
      recorded: true,
      facts: evidenceFacts(run),
      terminalCode: run.terminalCode,
      completedAt: run.completedAt,
    },
    ...settlementNodes(runFlow, run.id),
    {
      id: `memory:${run.id}`,
      kind: "memory",
      label: "Bounded memory",
      status: memories.length > 0 ? "retained" : MISSING,      provenance: "memory",
      recorded: memories.length > 0,
      facts: memories.length > 0 ? [text("Active records", String(memories.length))] : [],
      records: memories,
    },
  ];

  return {
    runId: run.id,
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      from: nodes[index]!.id,
      to: node.id,
    })),
    eventCount: events.length,
    memoryCount: memories.length,
    recordedCount: nodes.filter((node) => node.recorded).length,
    missingCount: nodes.filter((node) => !node.recorded).length,
  };
}
