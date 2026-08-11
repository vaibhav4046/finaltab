import "server-only";

import { createHash } from "node:crypto";
import { BASE_SEPOLIA_CHAIN_ID } from "@finaltab/engine";
import {
  deriveIdempotencyKey,
  type ExecuteAccepted,
  type ExecutionStatusResponse,
  type SimulateSuccess,
  type Verdict,
} from "@finaltab/keeperhub";
import { keeperHubClient } from "@/lib/server/clients";
import {
  SettleBodySchema,
  requiredV2SettlementContract,
  settleContractCall,
  type SettleBody,
} from "@/lib/server/settlement";
import {
  verifyBroadcastApproval,
  type SignedBroadcastApproval,
} from "@/lib/server/mcpSettlement";
import type { IndependentExecutionProof } from "@/lib/server/onchainProof";
import { issueProofCapability } from "@/lib/server/proofCapability";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export class SettlementSubmissionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementSubmissionBlockedError";
  }
}

export class SettlementPersistenceUnavailableError extends Error {
  constructor(message = "Server-side settlement persistence is unavailable.") {
    super(message);
    this.name = "SettlementPersistenceUnavailableError";
  }
}

export class SettlementPersistenceCommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementPersistenceCommitError";
  }
}

export interface DurableFlowAttachment {
  flowId: string;
  actorUserId: string;
}

interface SubmissionIntentRow {
  idempotency_key: string;
  principal_subject_hash: string;
  signed_body_hash: string;
  approval_hash: string;
  approval_expires_at: string;
  simulation_hash: string;
  simulation_record: unknown;
  plan_hash: string;
  ledger_hash: string;
  chain_id: number | string;
  contract_address: string;
  flow_id: string | null;
  state: "prepared" | "accepted" | "completed_unverified" | "verified_settled" | "failed" | "timeout";
  execution_id: string | null;
  execution_hash: string | null;
  execution_record: unknown;
  revision: number;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) return nested;
    return Object.fromEntries(
      Object.entries(nested as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  });
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : canonicalJson(value))
    .digest("hex");
}

function firstIntentRow(value: unknown): SubmissionIntentRow | null {
  return Array.isArray(value) && value.length > 0 ? value[0] as SubmissionIntentRow : null;
}

function acceptedFromIntent(intent: SubmissionIntentRow): ExecuteAccepted | null {
  if (!intent.execution_record || typeof intent.execution_record !== "object" || Array.isArray(intent.execution_record)) return null;
  const record = intent.execution_record as Record<string, unknown>;
  if (typeof record.executionId !== "string" || record.executionId !== intent.execution_id) return null;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(record.executionId)) return null;
  return record as unknown as ExecuteAccepted;
}

function simulationFromIntent(intent: SubmissionIntentRow): SimulateSuccess {
  if (!intent.simulation_record || typeof intent.simulation_record !== "object" || Array.isArray(intent.simulation_record)) {
    throw new SettlementPersistenceCommitError("DURABLE_SIMULATION_RECORD_INVALID");
  }
  const simulation = intent.simulation_record as Record<string, unknown>;
  if (simulation.success !== true || simulation.wouldRevert === true) {
    throw new SettlementPersistenceCommitError("DURABLE_SIMULATION_RECORD_INVALID");
  }
  return simulation as unknown as SimulateSuccess;
}

function parsedBody(value: unknown): SettleBody {
  return SettleBodySchema.parse(value);
}

function preparedCall(value: unknown) {
  const body = parsedBody(value);
  const contract = requiredV2SettlementContract();
  // This recomputes the complete V2 debit+payout plan hash, validates every
  // authorization nonce and refuses an authorization aimed at another target.
  const call = settleContractCall(body, contract);
  return { body, contract, call };
}

function requiredKeeperHubClient() {
  const { client, blockedReason } = keeperHubClient();
  if (!client) throw new SettlementSubmissionBlockedError(blockedReason ?? "KeeperHub is not configured");
  return client;
}

export function settlementExecutionIdempotencyKey(body: SettleBody, contract: `0x${string}`): string {
  const call = settleContractCall(body, contract);
  return deriveIdempotencyKey({
    taskId: call.taskId!,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    recipientAddress: contract,
    amount: "0",
    tokenAddress: body.settlementId,
  });
}

async function prepareDurableSubmission(options: {
  principalSubject: string;
  approval: SignedBroadcastApproval;
  idempotencyKey: string;
  body: SettleBody;
  contract: `0x${string}`;
  simulation: unknown;
  flow: DurableFlowAttachment | null;
}): Promise<{ intent: SubmissionIntentRow; signedBodyHash: string; principalHash: string }> {
  const mutationClient = createAdminSupabaseClient();
  if (!mutationClient) throw new SettlementPersistenceUnavailableError();
  const principalHash = digest(options.principalSubject);
  const signedBodyHash = digest(options.body);
  const approvalHash = digest(options.approval);
  const approvalExpiresAt = new Date(Number(options.approval.expiresAt) * 1_000).toISOString();
  const simulationHash = digest(options.simulation);
  const preparedAt = new Date().toISOString();
  const eventPayloadHash = digest({
    principalHash,
    idempotencyKey: options.idempotencyKey,
    signedBodyHash,
    approvalHash,
    approvalExpiresAt,
    simulationHash,
    planHash: options.body.settlementId.toLowerCase(),
    ledgerHash: options.body.ledgerHash.toLowerCase(),
    chainId: BASE_SEPOLIA_CHAIN_ID,
    contractAddress: options.contract.toLowerCase(),
    flowId: options.flow?.flowId ?? null,
  });
  const rpc = await mutationClient.rpc("prepare_durable_settlement_submission", {
    expected_principal_hash: principalHash,
    expected_idempotency_key: options.idempotencyKey,
    signed_body_digest: signedBodyHash,
    approval_digest: approvalHash,
    approval_expiry: approvalExpiresAt,
    simulation_digest: simulationHash,
    successful_simulation_record: options.simulation,
    expected_plan_hash: options.body.settlementId,
    expected_ledger_hash: options.body.ledgerHash,
    target_chain_id: BASE_SEPOLIA_CHAIN_ID,
    target_contract_address: options.contract,
    attached_flow: options.flow?.flowId ?? null,
    attached_flow_actor: options.flow?.actorUserId ?? null,
    prepared_timestamp: preparedAt,
    event_payload_hash: eventPayloadHash,
  });
  const intent = firstIntentRow(rpc.data);
  if (rpc.error || !intent) {
    throw new SettlementPersistenceCommitError(`SUBMISSION_INTENT_COMMIT_FAILED: ${rpc.error?.message ?? "no row returned"}`);
  }
  return { intent, signedBodyHash, principalHash };
}

async function readDurableSubmissionRetry(options: {
  principalSubject: string;
  approval: SignedBroadcastApproval;
  idempotencyKey: string;
  body: SettleBody;
  contract: `0x${string}`;
  flow: DurableFlowAttachment | null;
}): Promise<SubmissionIntentRow | null> {
  const mutationClient = createAdminSupabaseClient();
  if (!mutationClient) throw new SettlementPersistenceUnavailableError();
  const approvalExpiresAt = new Date(Number(options.approval.expiresAt) * 1_000).toISOString();
  const rpc = await mutationClient.rpc("read_durable_settlement_submission_retry", {
    expected_principal_hash: digest(options.principalSubject),
    expected_idempotency_key: options.idempotencyKey,
    signed_body_digest: digest(options.body),
    approval_digest: digest(options.approval),
    approval_expiry: approvalExpiresAt,
    expected_plan_hash: options.body.settlementId,
    expected_ledger_hash: options.body.ledgerHash,
    target_chain_id: BASE_SEPOLIA_CHAIN_ID,
    target_contract_address: options.contract,
    attached_flow: options.flow?.flowId ?? null,
    attached_flow_actor: options.flow?.actorUserId ?? null,
  });
  if (rpc.error) throw new SettlementPersistenceCommitError(`SUBMISSION_RETRY_READ_FAILED: ${rpc.error.message}`);
  return firstIntentRow(rpc.data);
}

async function persistDurableAcceptance(options: {
  principalHash: string;
  idempotencyKey: string;
  signedBodyHash: string;
  accepted: ExecuteAccepted;
}): Promise<SubmissionIntentRow> {
  const mutationClient = createAdminSupabaseClient();
  if (!mutationClient) throw new SettlementPersistenceUnavailableError();
  const executionHash = digest(options.accepted);
  const acceptedAt = new Date().toISOString();
  const eventPayloadHash = digest({
    idempotencyKey: options.idempotencyKey,
    executionId: options.accepted.executionId,
    executionHash,
  });
  const rpc = await mutationClient.rpc("record_durable_settlement_acceptance", {
    expected_principal_hash: options.principalHash,
    expected_idempotency_key: options.idempotencyKey,
    signed_body_digest: options.signedBodyHash,
    accepted_execution_id: options.accepted.executionId,
    accepted_execution_record: options.accepted,
    execution_digest: executionHash,
    accepted_timestamp: acceptedAt,
    event_payload_hash: eventPayloadHash,
  });
  const intent = firstIntentRow(rpc.data);
  if (rpc.error || !intent || intent.execution_id !== options.accepted.executionId || intent.execution_hash !== executionHash) {
    throw new SettlementPersistenceCommitError(
      `SUBMISSION_ACCEPTANCE_COMMIT_FAILED_RETRY_SAFE: ${rpc.error?.message ?? "durable acceptance mismatch"}`,
    );
  }
  return intent;
}

/** Validate the V2 plan and simulate the exact call without broadcasting. */
export async function simulateSignedSettlement(value: unknown) {
  const { body, contract, call } = preparedCall(value);
  const client = requiredKeeperHubClient();
  const simulation = await client.simulateContractCall(call);
  return { body, contract, call, client, simulation };
}

/**
 * The single server-only value-moving path for REST and MCP.
 *
 * Approval is exact-plan, principal and contract bound, but intentionally not
 * described as single-use: it may be retried until expiry. KeeperHub receives a
 * deterministic idempotency key and V2 rejects an already executed settlement.
 */
export async function submitApprovedSettlement(input: {
  signedSettlement: unknown;
  approval: SignedBroadcastApproval;
  principalSubject: string;
  allowedApprovers: readonly string[];
  durableFlow?: DurableFlowAttachment;
  beforeBroadcast?: () => Promise<void>;
}) {
  const { body, contract, call } = preparedCall(input.signedSettlement);
  const approvalInput = {
    approval: input.approval,
    principalSubject: input.principalSubject,
    contractAddress: contract,
    settlementId: body.settlementId,
    ledgerHash: body.ledgerHash,
    allowedApprovers: input.allowedApprovers,
  };
  const verifiedApproval = await verifyBroadcastApproval(approvalInput);

  // The service-role journal is a release gate for every value-moving surface.
  // No KeeperHub call is made when durable persistence is unavailable.
  if (!createAdminSupabaseClient()) throw new SettlementPersistenceUnavailableError();

  const idempotencyKey = settlementExecutionIdempotencyKey(body, contract);
  const prior = await readDurableSubmissionRetry({
    principalSubject: input.principalSubject,
    approval: input.approval,
    idempotencyKey,
    body,
    contract,
    flow: input.durableFlow ?? null,
  });

  // A previous KeeperHub acceptance may already have been durably recorded.
  // Return it before simulation so an onchain AlreadySettled revert cannot hide
  // the accepted execution during database-repair retries.
  const durableReplay = prior ? acceptedFromIntent(prior) : null;
  if (durableReplay) {
    const proofCapability = issueProofCapability({
      executionId: durableReplay.executionId,
      contractAddress: contract,
      settlementId: body.settlementId as `0x${string}`,
      ledgerHash: body.ledgerHash as `0x${string}`,
    });
    return {
      body,
      contract,
      simulation: simulationFromIntent(prior!),
      accepted: durableReplay,
      verifiedApproval,
      idempotencyKey,
      proofCapability,
      durableReplay: true,
    };
  }

  const client = requiredKeeperHubClient();
  // A prepared retry reuses the exact durable successful simulation. Re-running
  // simulation after an accepted-but-not-yet-recorded broadcast could revert as
  // AlreadySettled and strand the execution id. New work is always simulated.
  const simulation = prior?.state === "prepared"
    ? simulationFromIntent(prior)
    : await client.simulateContractCall(call);
  const prepared = prior
    ? {
        intent: prior,
        principalHash: digest(input.principalSubject),
        signedBodyHash: digest(body),
      }
    : await prepareDurableSubmission({
        principalSubject: input.principalSubject,
        approval: input.approval,
        idempotencyKey,
        body,
        contract,
        simulation,
        flow: input.durableFlow ?? null,
      });
  if (prepared.intent.state !== "prepared") throw new SettlementPersistenceCommitError("SUBMISSION_INTENT_STATE_INVALID");

  // Check the short-lived wallet approval again after persistence and
  // immediately before the only network value-moving call.
  await input.beforeBroadcast?.();
  await verifyBroadcastApproval(approvalInput);
  if (Number(input.approval.expiresAt) <= Math.floor(Date.now() / 1_000)) {
    throw new Error("broadcast approval expired before KeeperHub execution");
  }
  const accepted = await client.executeContractCall(call, idempotencyKey);
  await persistDurableAcceptance({
    principalHash: prepared.principalHash,
    idempotencyKey,
    signedBodyHash: prepared.signedBodyHash,
    accepted,
  });
  const proofCapability = issueProofCapability({
    executionId: accepted.executionId,
    contractAddress: contract,
    settlementId: body.settlementId as `0x${string}`,
    ledgerHash: body.ledgerHash as `0x${string}`,
  });

  return {
    body,
    contract,
    simulation,
    accepted,
    verifiedApproval,
    idempotencyKey,
    proofCapability,
    durableReplay: accepted.idempotentReplay === true,
  };
}

export function settlementObservationTarget(
  status: ExecutionStatusResponse,
  verdict: Verdict,
  independent: IndependentExecutionProof | null,
): "completed_unverified" | "verified_settled" | "failed" | "timeout" | null {
  if (verdict.verdict === "PENDING") return null;
  if (verdict.verdict === "VERIFIED_SETTLED" && independent?.verified === true) return "verified_settled";
  if (verdict.verdict === "FAILED") return "failed";
  const receipts = Array.isArray(status.receipts) ? status.receipts : [];
  if (receipts.some((receipt) => receipt?.receiptStatus === "timeout" || receipt?.receiptStatus === "not_found")) return "timeout";
  return status.status === "completed" ? "completed_unverified" : null;
}

export async function assertDurableSettlementObservationAccess(input: {
  executionId: string;
  principalSubject?: string;
  proofCapabilityAuthorized?: boolean;
  settlementId: `0x${string}`;
  ledgerHash: `0x${string}`;
  contractAddress: `0x${string}`;
}): Promise<void> {
  if (!input.principalSubject && input.proofCapabilityAuthorized !== true) {
    throw new SettlementPersistenceCommitError("SUBMISSION_OBSERVATION_AUTHORITY_REQUIRED");
  }
  const mutationClient = createAdminSupabaseClient();
  if (!mutationClient) throw new SettlementPersistenceUnavailableError();
  const rpc = await mutationClient.rpc("assert_durable_settlement_observation_access", {
    accepted_execution_id: input.executionId,
    expected_principal_hash: input.principalSubject ? digest(input.principalSubject) : null,
    capability_authorized: input.proofCapabilityAuthorized === true,
    expected_plan_hash: input.settlementId,
    expected_ledger_hash: input.ledgerHash,
    target_chain_id: BASE_SEPOLIA_CHAIN_ID,
    target_contract_address: input.contractAddress,
  });
  if (rpc.error || rpc.data !== true) {
    throw new SettlementPersistenceCommitError(`SUBMISSION_OBSERVATION_ACCESS_REJECTED: ${rpc.error?.message ?? "authority check returned false"}`);
  }
}

/** Persist a terminal status/proof for a submission created by UI, REST or MCP. */
export async function persistDurableSettlementObservation(input: {
  executionId: string;
  principalSubject?: string;
  proofCapabilityAuthorized?: boolean;
  settlementId: `0x${string}`;
  ledgerHash: `0x${string}`;
  contractAddress: `0x${string}`;
  status: ExecutionStatusResponse;
  verdict: Verdict;
  independent: IndependentExecutionProof | null;
}): Promise<{ persisted: boolean; state: string | null }> {
  if (!input.principalSubject && input.proofCapabilityAuthorized !== true) {
    throw new SettlementPersistenceCommitError("SUBMISSION_OBSERVATION_AUTHORITY_REQUIRED");
  }
  const targetState = settlementObservationTarget(input.status, input.verdict, input.independent);
  if (!targetState) return { persisted: false, state: null };
  const mutationClient = createAdminSupabaseClient();
  if (!mutationClient) throw new SettlementPersistenceUnavailableError();
  const proof = {
    verified: targetState === "verified_settled",
    checkedAt: input.independent?.checkedAt ?? new Date().toISOString(),
    executionId: input.executionId,
    settlementId: input.settlementId.toLowerCase(),
    ledgerHash: input.ledgerHash.toLowerCase(),
    contractAddress: input.contractAddress.toLowerCase(),
    chainId: BASE_SEPOLIA_CHAIN_ID,
    keeperHubVerdict: input.verdict.verdict,
    receiptHashes: Array.isArray(input.status.receipts)
      ? input.status.receipts.flatMap((receipt) => /^0x[0-9a-fA-F]{64}$/.test(receipt.hash) ? [receipt.hash.toLowerCase()] : [])
      : [],
    independent: input.independent,
  };
  const statusHash = digest(input.status);
  const proofHash = digest(proof);
  const observedAt = new Date().toISOString();
  const eventPayloadHash = digest({
    executionId: input.executionId,
    targetState,
    statusHash,
    proofHash,
  });
  const rpc = await mutationClient.rpc("record_durable_settlement_observation", {
    accepted_execution_id: input.executionId,
    expected_principal_hash: input.principalSubject ? digest(input.principalSubject) : null,
    capability_authorized: input.proofCapabilityAuthorized === true,
    expected_plan_hash: input.settlementId,
    expected_ledger_hash: input.ledgerHash,
    target_chain_id: BASE_SEPOLIA_CHAIN_ID,
    target_contract_address: input.contractAddress,
    target_state: targetState,
    observed_status_record: input.status,
    keeperhub_status_digest: statusHash,
    independent_proof_record: proof,
    proof_digest: proofHash,
    observed_timestamp: observedAt,
    event_payload_hash: eventPayloadHash,
  });
  const intent = firstIntentRow(rpc.data);
  if (rpc.error || !intent || intent.execution_id !== input.executionId || intent.state !== targetState) {
    throw new SettlementPersistenceCommitError(`SUBMISSION_OBSERVATION_COMMIT_FAILED: ${rpc.error?.message ?? "durable observation mismatch"}`);
  }
  return { persisted: true, state: targetState };
}

export const settlementSubmissionInternals = {
  canonicalJson,
  digest,
  observationTarget: settlementObservationTarget,
};
