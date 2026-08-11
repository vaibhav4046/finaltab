export const AGENT_STAGE_ORDER = [
  "extraction_validation",
  "allocation_arithmetic",
  "consent_risk",
  "proof_verification",
] as const;

export type SettlementAgentStage = (typeof AGENT_STAGE_ORDER)[number];
export type SettlementAgentStageStatus = "passed" | "blocked" | "failed" | "skipped";
export type SettlementAgentRunStatus =
  | "pending"
  | "running"
  | "ready"
  | "verified"
  | "blocked"
  | "failed"
  | "cancelled";

export interface SettlementBalanceRow {
  participantId: string;
  displayName: string;
  walletAddress: `0x${string}` | null;
  shareMinor: string;
  paidMinor: string;
  netMinor: string;
  position: "receivable" | "payable" | "settled";
  approvalState: "not_frozen" | "pending" | "signed" | "rejected" | "expired" | "revoked";
}

export interface SettlementAgentRun {
  id: string;
  ownerId: string;
  tabId: string;
  inputHash: string;
  chainAdapter: "base-sepolia";
  status: SettlementAgentRunStatus;
  stageCount: number;
  modelProvider: string | null;
  modelName: string | null;
  modelUsage: Record<string, number>;
  modelCostMicrousd: string | null;
  resultSummary: Record<string, unknown>;
  terminalCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementAgentEvent {
  id: string;
  runId: string;
  sequence: number;
  stage: SettlementAgentStage;
  status: SettlementAgentStageStatus;
  deterministic: boolean;
  inputHash: string;
  outputSummary: Record<string, unknown>;
  modelProvider: string | null;
  modelName: string | null;
  modelUsage: Record<string, number>;
  modelCostMicrousd: string | null;
  durationMs: number;
  createdAt: string;
}

export interface SettlementAgentMemory {
  id: string;
  tabId: string;
  sourceRunId: string | null;
  memoryKey: string;
  contentHash: string;
  summary: Record<string, unknown>;
  revision: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementAgentRunDetail extends SettlementAgentRun {
  events: SettlementAgentEvent[];
  memory: SettlementAgentMemory[];
}
