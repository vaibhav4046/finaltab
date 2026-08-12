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

export type SettlementLineageState =
  | "frozen"
  | "simulated"
  | "submitted"
  | "completed_unverified"
  | "verified_settled"
  | "failed"
  | "timeout";

export type SettlementLineageEventKind = "frozen" | "simulated" | "submitted" | "terminal" | "reconciled";

/**
 * Client-safe mirror of the attested `DurableSettlementFlow` returned by
 * `lib/server/settlementFlow.ts`, which is `server-only` and therefore cannot be
 * imported here. The server assigns its own type to this one, so a renamed or
 * removed field is a compile error rather than a silently missing value.
 */
export interface SettlementLineageFlow {
  id: string;
  runId: string;
  ledgerId: string;
  settlementRecordId: string;
  ledgerHash: string;
  settlementId: string;
  chainId: number;
  contractAddress: string;
  state: SettlementLineageState;
  revision: number;
  signedBodyHash: string | null;
  simulationHash: string | null;
  executionId: string | null;
  executionHash: string | null;
  proofVerified: boolean;
  receiptCount: number;
  proofCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    revision: number;
    kind: SettlementLineageEventKind;
    state: SettlementLineageState;
    createdAt: string;
  }>;
}
