import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { serializeSignature } from "viem";
import {
  AllocationProposalSchema,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  aggregateSettlementTransfers,
  canonicalizeLedger,
  hashSettlementPlan,
  ledgerHash as computeLedgerHash,
  ledgerToCanonicalJson,
  nettedTransfers,
  reconcileAllocation,
  sharesToDebts,
  type CanonicalLedger,
} from "@finaltab/engine";
import type { ExecutionStatusResponse, Verdict } from "@finaltab/keeperhub";
import type { IndependentExecutionProof } from "@/lib/server/onchainProof";
import { settlementObservationTarget } from "@/lib/server/settlementSubmission";
import {
  StartSettlementAgentRunSchema,
  getSettlementAgentPersistenceContext,
  walletBackedParticipantSnapshot,
} from "@/lib/server/agentControl";
import {
  SettleBodySchema,
  requiredV2SettlementContract,
  type SettleBody,
} from "@/lib/server/settlement";
import type { FrozenLedgerState } from "@/lib/types";

const UUID = z.string().uuid();
const HEX32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const ADDRESS = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const HASH = z.string().regex(/^[0-9a-f]{64}$/);
const MAX_FLOW_HISTORY = 20;

export const FrozenLedgerSchema = z.object({
  canonicalJson: z.string().min(2).max(192_000),
  ledgerHash: HEX32,
  settlementId: HEX32,
  transfers: z.array(z.object({ from: ADDRESS, to: ADDRESS, value: z.string().regex(/^[1-9][0-9]*$/) }).strict()).min(1).max(50),
  debits: z.array(z.object({ debtor: ADDRESS, value: z.string().regex(/^[1-9][0-9]*$/) }).strict()).min(1).max(50),
  payouts: z.array(z.object({ creditor: ADDRESS, value: z.string().regex(/^[1-9][0-9]*$/) }).strict()).min(1).max(50),
}).strict();

export const FreezeSettlementFlowSchema = z.object({
  runId: UUID,
  inputHash: HASH,
  receiptId: UUID,
  allocationId: UUID,
  expectedFrozen: FrozenLedgerSchema,
}).strict();

export const SimulateSettlementFlowSchema = z.object({
  flowId: UUID,
  signedSettlement: SettleBodySchema,
}).strict();

export const ExecuteSettlementFlowSchema = z.object({
  flowId: UUID,
  signedSettlement: SettleBodySchema,
  approval: z.object({
    version: z.literal(1),
    approvalId: UUID,
    principalSubject: z.string().min(1).max(200),
    approver: ADDRESS,
    chainId: z.literal(BASE_SEPOLIA_CHAIN_ID),
    contractAddress: ADDRESS,
    settlementId: HEX32,
    ledgerHash: HEX32,
    issuedAt: z.string().regex(/^\d+$/),
    expiresAt: z.string().regex(/^\d+$/),
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  }).strict(),
}).strict();

export const SettlementFlowStatusSchema = z.object({ flowId: UUID }).strict();

const ReviewedInputRecordSchema = z.object({
  version: z.literal(1),
  tabId: UUID,
  receipt: StartSettlementAgentRunSchema.shape.receipt,
  receiptConfirmed: z.literal(true),
  payerParticipantId: UUID,
  instruction: z.string().min(1).max(2_000),
  extractionProvider: z.string().max(80).nullable(),
  extractionAttempts: z.number().int().min(1).max(3),
  participants: z.array(z.object({
    id: UUID,
    name: z.string().min(1).max(64),
    walletAddress: ADDRESS.transform((value) => value.toLowerCase() as `0x${string}`),
  }).strict()).min(2).max(32),
  existingProposal: AllocationProposalSchema,
  chainAdapter: z.literal("base-sepolia"),
  maxStages: z.literal(4),
}).strict();

type FlowState =
  | "frozen"
  | "simulated"
  | "submitted"
  | "completed_unverified"
  | "verified_settled"
  | "failed"
  | "timeout";
type FlowEventKind = "frozen" | "simulated" | "submitted" | "terminal" | "reconciled";

interface FlowRow {
  id: string;
  created_by: string;
  tab_id: string;
  agent_run_id: string | null;
  agent_run_id_snapshot: string;
  agent_run_snapshot: unknown;
  agent_run_hash: string;
  receipt_id: string;
  allocation_id: string;
  ledger_id: string;
  settlement_record_id: string;
  input_hash: string;
  canonical_hash: string;
  transfer_hash: string;
  ledger_hash: string;
  plan_hash: string;
  chain_id: number | string;
  contract_address: string;
  state: FlowState;
  signed_body_hash: string | null;
  simulation_hash: string | null;
  execution_id: string | null;
  execution_hash: string | null;
  execution_result: unknown;
  keeperhub_status_hash: string | null;
  keeperhub_status: unknown;
  proof_hash: string | null;
  independent_proof: unknown;
  revision: number;
  attested_at: string;
  attestation: string;
  created_at: string;
  updated_at: string;
}

interface FlowEventRow {
  id: number | string;
  flow_id: string;
  created_by: string;
  tab_id: string;
  revision: number;
  event_kind: FlowEventKind;
  state: FlowState;
  payload_hash: string;
  attested_at: string;
  attestation: string;
  created_at: string;
}

export interface DurableSettlementFlow {
  id: string;
  tabId: string;
  runId: string;
  receiptId: string;
  allocationId: string;
  ledgerId: string;
  settlementRecordId: string;
  ledgerHash: `0x${string}`;
  settlementId: `0x${string}`;
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  contractAddress: `0x${string}`;
  state: FlowState;
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
  events: Array<{ revision: number; kind: FlowEventKind; state: FlowState; createdAt: string }>;
}

interface DerivedFreeze {
  frozen: FrozenLedgerState;
  transferRows: Array<{ debtorParticipantId: string; creditorParticipantId: string; usdcMinor: string }>;
  runId: string;
  runSnapshot: Record<string, unknown>;
  runHash: string;
  ownerId: string;
  tabId: string;
  inputHash: string;
  receiptId: string;
  allocationId: string;
  canonicalHash: string;
  transferHash: string;
  contractAddress: `0x${string}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

function requiredSecret(): string {
  const secret = process.env.FINALTAB_AGENT_ATTESTATION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AGENT_ATTESTATION_NOT_CONFIGURED");
  return secret;
}

function sign(payload: Record<string, unknown>): string {
  return createHmac("sha256", requiredSecret()).update(canonicalJson(payload)).digest("hex");
}

function verify(signature: string, payload: Record<string, unknown>): boolean {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(sign(payload), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function canonicalTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("INVALID_ATTESTATION_TIME");
  return date.toISOString();
}

function deterministicUuid(kind: "flow" | "ledger" | "settlement", runId: string): string {
  const bytes = createHmac("sha256", requiredSecret()).update(`settlement-flow:${kind}:${runId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function flowAttestationPayload(row: Omit<FlowRow, "attestation" | "created_at" | "updated_at">): Record<string, unknown> {
  return {
    version: 1,
    kind: "settlement-flow-revision",
    flowId: row.id,
    ownerId: row.created_by,
    tabId: row.tab_id,
    runId: row.agent_run_id_snapshot,
    runSnapshotHash: row.agent_run_hash,
    receiptId: row.receipt_id,
    allocationId: row.allocation_id,
    ledgerId: row.ledger_id,
    settlementRecordId: row.settlement_record_id,
    inputHash: row.input_hash,
    canonicalHash: row.canonical_hash,
    transferHash: row.transfer_hash,
    ledgerHash: row.ledger_hash.toLowerCase(),
    planHash: row.plan_hash.toLowerCase(),
    chainId: Number(row.chain_id),
    contractAddress: row.contract_address.toLowerCase(),
    state: row.state,
    signedBodyHash: row.signed_body_hash,
    simulationHash: row.simulation_hash,
    executionId: row.execution_id,
    executionHash: row.execution_hash,
    keeperHubStatusHash: row.keeperhub_status_hash,
    proofHash: row.proof_hash,
    revision: Number(row.revision),
    attestedAt: canonicalTime(row.attested_at),
  };
}

function eventAttestationPayload(row: Omit<FlowEventRow, "id" | "attestation" | "created_at">): Record<string, unknown> {
  return {
    version: 1,
    kind: "settlement-flow-event",
    flowId: row.flow_id,
    ownerId: row.created_by,
    tabId: row.tab_id,
    revision: Number(row.revision),
    eventKind: row.event_kind,
    state: row.state,
    payloadHash: row.payload_hash,
    attestedAt: canonicalTime(row.attested_at),
  };
}

function rowIsAttested(row: FlowRow): boolean {
  if (digest(row.agent_run_snapshot) !== row.agent_run_hash) return false;
  const revisionShape =
    (row.revision === 1 && row.state === "frozen" && row.signed_body_hash === null && row.simulation_hash === null && row.execution_id === null && row.execution_hash === null && row.execution_result === null && row.keeperhub_status_hash === null && row.keeperhub_status === null && row.proof_hash === null && row.independent_proof === null) ||
    (row.revision === 2 && row.state === "simulated" && row.signed_body_hash !== null && row.simulation_hash !== null && row.execution_id === null && row.execution_hash === null && row.execution_result === null && row.keeperhub_status_hash === null && row.keeperhub_status === null && row.proof_hash === null && row.independent_proof === null) ||
    (row.revision === 3 && row.state === "submitted" && row.signed_body_hash !== null && row.simulation_hash !== null && row.execution_id !== null && row.execution_hash !== null && row.execution_result !== null && row.keeperhub_status_hash === null && row.keeperhub_status === null && row.proof_hash === null && row.independent_proof === null) ||
    ((row.revision === 4 && ["completed_unverified", "verified_settled", "failed", "timeout"].includes(row.state)) ||
      (row.revision === 5 && row.state === "verified_settled")) &&
      row.signed_body_hash !== null && row.simulation_hash !== null && row.execution_id !== null &&
      row.execution_hash !== null && row.execution_result !== null && row.keeperhub_status_hash !== null &&
      row.keeperhub_status !== null && row.proof_hash !== null && row.independent_proof !== null;
  if (!revisionShape) return false;
  if (row.execution_hash !== null && digest(row.execution_result) !== row.execution_hash) return false;
  if (row.keeperhub_status_hash !== null && digest(row.keeperhub_status) !== row.keeperhub_status_hash) return false;
  if (row.proof_hash !== null && digest(row.independent_proof) !== row.proof_hash) return false;
  const execution = record(row.execution_result);
  if (row.execution_id !== null && execution.executionId !== row.execution_id) return false;
  if (row.revision >= 4) {
    const keeperHub = record(row.keeperhub_status);
    const proof = record(row.independent_proof);
    if (
      keeperHub.executionId !== row.execution_id ||
      proof.executionId !== row.execution_id ||
      String(proof.settlementId).toLowerCase() !== row.plan_hash.toLowerCase() ||
      String(proof.ledgerHash).toLowerCase() !== row.ledger_hash.toLowerCase() ||
      String(proof.contractAddress).toLowerCase() !== row.contract_address.toLowerCase() ||
      Number(proof.chainId) !== Number(row.chain_id) ||
      !Array.isArray(proof.receiptHashes)
    ) return false;
  }
  return verify(row.attestation, flowAttestationPayload(row));
}

function eventIsAttested(row: FlowEventRow): boolean {
  return verify(row.attestation, eventAttestationPayload(row));
}

function verifiedFlow(row: FlowRow, events: FlowEventRow[]): boolean {
  if (!rowIsAttested(row) || events.length !== Number(row.revision)) return false;
  const ordered = [...events].sort((left, right) => Number(left.revision) - Number(right.revision));
  return ordered.every((event, index) =>
    event.flow_id === row.id &&
    event.created_by === row.created_by &&
    event.tab_id === row.tab_id &&
    Number(event.revision) === index + 1 &&
    eventIsAttested(event),
  ) && ordered.at(-1)?.state === row.state;
}

function publicFlow(row: FlowRow, events: FlowEventRow[]): DurableSettlementFlow {
  const proof = record(row.independent_proof);
  const keeperHub = record(row.keeperhub_status);
  const receipts = Array.isArray(keeperHub.receipts) ? keeperHub.receipts : [];
  return {
    id: row.id,
    tabId: row.tab_id,
    runId: row.agent_run_id_snapshot,
    receiptId: row.receipt_id,
    allocationId: row.allocation_id,
    ledgerId: row.ledger_id,
    settlementRecordId: row.settlement_record_id,
    ledgerHash: row.ledger_hash.toLowerCase() as `0x${string}`,
    settlementId: row.plan_hash.toLowerCase() as `0x${string}`,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    contractAddress: row.contract_address.toLowerCase() as `0x${string}`,
    state: row.state,
    revision: Number(row.revision),
    signedBodyHash: row.signed_body_hash,
    simulationHash: row.simulation_hash,
    executionId: row.execution_id,
    executionHash: row.execution_hash,
    proofVerified: row.state === "verified_settled" && proof.verified === true,
    receiptCount: receipts.length,
    proofCheckedAt: typeof proof.checkedAt === "string" ? proof.checkedAt : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: [...events]
      .sort((left, right) => Number(left.revision) - Number(right.revision))
      .map((event) => ({
        revision: Number(event.revision),
        kind: event.event_kind,
        state: event.state,
        createdAt: event.created_at,
      })),
  };
}

async function readRows(
  client: SupabaseClient,
  options: { flowId?: string; runId?: string; tabId?: string; limit?: number },
): Promise<Array<{ row: FlowRow; events: FlowEventRow[] }>> {
  let query = client
    .from("settlement_flow_records")
    .select("id,created_by,tab_id,agent_run_id,agent_run_id_snapshot,agent_run_snapshot,agent_run_hash,receipt_id,allocation_id,ledger_id,settlement_record_id,input_hash,canonical_hash,transfer_hash,ledger_hash,plan_hash,chain_id,contract_address,state,signed_body_hash,simulation_hash,execution_id,execution_hash,execution_result,keeperhub_status_hash,keeperhub_status,proof_hash,independent_proof,revision,attested_at,attestation,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(MAX_FLOW_HISTORY, options.limit ?? MAX_FLOW_HISTORY)));
  if (options.flowId) query = query.eq("id", options.flowId);
  if (options.runId) query = query.eq("agent_run_id_snapshot", options.runId);
  if (options.tabId) query = query.eq("tab_id", options.tabId);
  const rowsResult = await query;
  if (rowsResult.error) throw new Error(`SETTLEMENT_FLOW_READ_FAILED: ${rowsResult.error.message}`);
  const rows = (rowsResult.data ?? []) as FlowRow[];
  if (rows.length === 0) return [];
  const eventResult = await client
    .from("settlement_flow_events")
    .select("id,flow_id,created_by,tab_id,revision,event_kind,state,payload_hash,attested_at,attestation,created_at")
    .in("flow_id", rows.map((row) => row.id))
    .order("revision", { ascending: true });
  if (eventResult.error) throw new Error(`SETTLEMENT_FLOW_EVENT_READ_FAILED: ${eventResult.error.message}`);
  const events = (eventResult.data ?? []) as FlowEventRow[];
  return rows.map((row) => ({ row, events: events.filter((event) => event.flow_id === row.id) }));
}

export async function getDurableSettlementFlow(
  client: SupabaseClient,
  flowId: string,
): Promise<{ internal: FlowRow; public: DurableSettlementFlow } | null> {
  const match = (await readRows(client, { flowId, limit: 1 }))[0];
  if (!match || !verifiedFlow(match.row, match.events)) return null;
  return { internal: match.row, public: publicFlow(match.row, match.events) };
}

export async function getDurableSettlementFlowByRun(
  client: SupabaseClient,
  runId: string,
): Promise<{ internal: FlowRow; public: DurableSettlementFlow } | null> {
  const match = (await readRows(client, { runId, limit: 1 }))[0];
  if (!match || !verifiedFlow(match.row, match.events)) return null;
  return { internal: match.row, public: publicFlow(match.row, match.events) };
}

export async function listDurableSettlementFlows(
  client: SupabaseClient,
  tabId: string,
  limit = MAX_FLOW_HISTORY,
): Promise<DurableSettlementFlow[]> {
  return (await readRows(client, { tabId, limit }))
    .filter((match) => verifiedFlow(match.row, match.events))
    .map((match) => publicFlow(match.row, match.events));
}

function exactEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

async function deriveReviewedFreeze(
  client: SupabaseClient,
  userId: string,
  input: z.infer<typeof FreezeSettlementFlowSchema>,
): Promise<DerivedFreeze> {
  const context = await getSettlementAgentPersistenceContext(client, input.runId);
  if (!context || context.run.ownerId !== userId) throw new Error("ATTESTED_RUN_NOT_FOUND");
  if (context.run.status !== "ready" && context.run.status !== "verified") throw new Error("ATTESTED_RUN_NOT_READY");
  if (context.run.inputHash !== input.inputHash) throw new Error("RUN_INPUT_HASH_MISMATCH");
  const reviewed = ReviewedInputRecordSchema.parse(context.inputRecord);
  const result = record(context.run.resultSummary);
  const invariants = record(result.invariants);
  if (
    reviewed.tabId !== context.run.tabId ||
    input.receiptId !== result.receiptId ||
    input.allocationId !== result.allocationId ||
    reviewed.payerParticipantId !== result.payerParticipantId ||
    invariants.receiptArithmetic !== true ||
    invariants.allocationConservation !== true ||
    invariants.consentRisk !== true
  ) throw new Error("RUN_DURABLE_BINDING_MISMATCH");

  const [participantsResult, receiptResult, allocationResult] = await Promise.all([
    client
      .from("participants")
      .select("id,display_name,wallet_address")
      .eq("tab_id", reviewed.tabId)
      .order("created_at", { ascending: true }),
    client
      .from("receipts")
      .select("id,tab_id,raw_extraction,confirmed_by,confirmed_at,total_minor")
      .eq("id", input.receiptId)
      .eq("tab_id", reviewed.tabId)
      .maybeSingle(),
    client
      .from("allocations")
      .select("id,tab_id,instruction,model_proposal,reconciled_shares")
      .eq("id", input.allocationId)
      .eq("tab_id", reviewed.tabId)
      .maybeSingle(),
  ]);
  if (participantsResult.error || receiptResult.error || allocationResult.error) {
    throw new Error(`FLOW_CONTEXT_READ_FAILED: ${participantsResult.error?.message ?? receiptResult.error?.message ?? allocationResult.error?.message}`);
  }
  if (!receiptResult.data || !allocationResult.data) throw new Error("REVIEWED_DURABLE_RECORD_MISSING");
  if (receiptResult.data.confirmed_by !== userId || !receiptResult.data.confirmed_at) {
    throw new Error("REVIEWED_RECEIPT_NOT_CONFIRMED_BY_RUN_OWNER");
  }
  if (!exactEqual(receiptResult.data.raw_extraction, reviewed.receipt)) throw new Error("REVIEWED_RECEIPT_CHANGED");
  if (allocationResult.data.instruction !== reviewed.instruction) throw new Error("REVIEWED_ALLOCATION_CHANGED");

  const currentParticipants = walletBackedParticipantSnapshot(
    (participantsResult.data ?? []).map((participant) => ({
      id: participant.id as string,
      display_name: participant.display_name as string,
      wallet_address: typeof participant.wallet_address === "string" ? participant.wallet_address : null,
    })),
  );
  if (!exactEqual(currentParticipants, reviewed.participants)) throw new Error("REVIEWED_PARTICIPANTS_CHANGED");
  const addressSet = new Set(reviewed.participants.map((participant) => participant.walletAddress));
  if (addressSet.size !== reviewed.participants.length) throw new Error("DUPLICATE_PARTICIPANT_WALLET");

  const proposal = { ...reviewed.existingProposal, payerId: reviewed.payerParticipantId };
  if (!exactEqual(allocationResult.data.model_proposal, proposal)) throw new Error("REVIEWED_ALLOCATION_PROPOSAL_CHANGED");
  const reconciled = reconcileAllocation(reviewed.receipt, proposal);
  if (!reconciled.ok || !reconciled.shares) throw new Error("REVIEWED_ALLOCATION_NO_LONGER_RECONCILES");
  const expectedShares = Object.fromEntries(
    [...reconciled.shares.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, value]) => [id, value.toString()]),
  );
  if (!exactEqual(allocationResult.data.reconciled_shares, expectedShares)) throw new Error("REVIEWED_ALLOCATION_SHARES_CHANGED");
  if (String(receiptResult.data.total_minor) !== reconciled.totalMinor.toString()) throw new Error("REVIEWED_RECEIPT_TOTAL_CHANGED");

  const netted = nettedTransfers(sharesToDebts(reconciled.shares, reviewed.payerParticipantId));
  const participantById = new Map(reviewed.participants.map((participant) => [participant.id, participant]));
  const transfers = netted.map((transfer) => {
    const debtor = participantById.get(transfer.debtor);
    const creditor = participantById.get(transfer.creditor);
    if (!debtor || !creditor) throw new Error("REVIEWED_TRANSFER_PARTICIPANT_MISSING");
    return { from: debtor.walletAddress, to: creditor.walletAddress, value: transfer.amount };
  });
  if (transfers.length < 1 || transfers.length > 50) throw new Error("REVIEWED_TRANSFER_COUNT_OUT_OF_BOUNDS");
  const ledger: CanonicalLedger = canonicalizeLedger({
    version: 1,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    participants: reviewed.participants.map((participant) => ({
      id: participant.id,
      displayName: participant.name,
      address: participant.walletAddress,
    })),
    transfers,
    receiptIds: [input.receiptId],
  });
  const canonicalLedgerJson = ledgerToCanonicalJson(ledger);
  const ledgerHash = computeLedgerHash(ledger);
  const contractAddress = requiredV2SettlementContract();
  const aggregate = aggregateSettlementTransfers(ledger.transfers);
  const settlementId = hashSettlementPlan({ ledgerHash, settlementContract: contractAddress, debits: aggregate.debits, payouts: aggregate.payouts });
  const frozen: FrozenLedgerState = {
    canonicalJson: canonicalLedgerJson,
    ledgerHash,
    settlementId,
    transfers: ledger.transfers.map((transfer) => ({ from: transfer.from, to: transfer.to, value: transfer.value.toString() })),
    debits: aggregate.debits.map((debit) => ({ debtor: debit.debtor, value: debit.value.toString() })),
    payouts: aggregate.payouts.map((payout) => ({ creditor: payout.creditor, value: payout.value.toString() })),
  };
  if (!exactEqual(FrozenLedgerSchema.parse(input.expectedFrozen), frozen)) throw new Error("CLIENT_SERVER_LEDGER_MISMATCH");
  const transferRows = netted.map((transfer) => ({
    debtorParticipantId: transfer.debtor,
    creditorParticipantId: transfer.creditor,
    usdcMinor: transfer.amount.toString(),
  }));
  return {
    frozen,
    transferRows,
    runId: context.run.id,
    runSnapshot: context.runSnapshot,
    runHash: digest(context.runSnapshot),
    ownerId: userId,
    tabId: context.run.tabId,
    inputHash: context.run.inputHash,
    receiptId: input.receiptId,
    allocationId: input.allocationId,
    canonicalHash: digest(canonicalLedgerJson),
    transferHash: digest(transferRows),
    contractAddress,
  };
}

function nextAttestations(
  row: Omit<FlowRow, "attestation" | "created_at" | "updated_at">,
  eventKind: FlowEventKind,
  eventPayloadHash: string,
): { flowAttestation: string; eventAttestation: string } {
  return {
    flowAttestation: sign(flowAttestationPayload(row)),
    eventAttestation: sign(eventAttestationPayload({
      flow_id: row.id,
      created_by: row.created_by,
      tab_id: row.tab_id,
      revision: row.revision,
      event_kind: eventKind,
      state: row.state,
      payload_hash: eventPayloadHash,
      attested_at: row.attested_at,
    })),
  };
}

function firstRpcRow<T>(value: unknown): T | null {
  return Array.isArray(value) && value.length > 0 ? value[0] as T : null;
}

export async function freezeDurableSettlement(
  client: SupabaseClient,
  mutationClient: SupabaseClient,
  userId: string,
  rawInput: unknown,
): Promise<{ flow: DurableSettlementFlow; frozen: FrozenLedgerState; idempotent: boolean }> {
  const input = FreezeSettlementFlowSchema.parse(rawInput);
  const derived = await deriveReviewedFreeze(client, userId, input);
  const prior = await getDurableSettlementFlowByRun(client, derived.runId);
  if (prior) {
    if (
      prior.public.receiptId !== derived.receiptId ||
      prior.public.allocationId !== derived.allocationId ||
      prior.public.ledgerHash !== derived.frozen.ledgerHash.toLowerCase() ||
      prior.public.settlementId !== derived.frozen.settlementId.toLowerCase() ||
      prior.public.chainId !== BASE_SEPOLIA_CHAIN_ID ||
      prior.public.contractAddress !== derived.contractAddress.toLowerCase()
    ) throw new Error("FLOW_FREEZE_MISMATCH");
    return { flow: prior.public, frozen: derived.frozen, idempotent: true };
  }

  const flowId = deterministicUuid("flow", derived.runId);
  const ledgerId = deterministicUuid("ledger", derived.runId);
  const settlementRecordId = deterministicUuid("settlement", derived.runId);
  const attestedAt = new Date().toISOString();
  const eventPayloadHash = digest({
    canonicalHash: derived.canonicalHash,
    transferHash: derived.transferHash,
    ledgerHash: derived.frozen.ledgerHash.toLowerCase(),
    planHash: derived.frozen.settlementId.toLowerCase(),
  });
  const row = {
    id: flowId,
    created_by: derived.ownerId,
    tab_id: derived.tabId,
    agent_run_id: derived.runId,
    agent_run_id_snapshot: derived.runId,
    agent_run_snapshot: derived.runSnapshot,
    agent_run_hash: derived.runHash,
    receipt_id: derived.receiptId,
    allocation_id: derived.allocationId,
    ledger_id: ledgerId,
    settlement_record_id: settlementRecordId,
    input_hash: derived.inputHash,
    canonical_hash: derived.canonicalHash,
    transfer_hash: derived.transferHash,
    ledger_hash: derived.frozen.ledgerHash.toLowerCase(),
    plan_hash: derived.frozen.settlementId.toLowerCase(),
    chain_id: BASE_SEPOLIA_CHAIN_ID,
    contract_address: derived.contractAddress.toLowerCase(),
    state: "frozen" as const,
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
    attested_at: attestedAt,
  };
  const attestations = nextAttestations(row, "frozen", eventPayloadHash);
  const rpc = await mutationClient.rpc("freeze_reviewed_settlement_flow", {
    requested_flow: flowId,
    target_run: derived.runId,
    expected_owner: userId,
    expected_input_hash: derived.inputHash,
    expected_run_snapshot: derived.runSnapshot,
    expected_run_hash: derived.runHash,
    expected_receipt: derived.receiptId,
    expected_allocation: derived.allocationId,
    requested_ledger: ledgerId,
    requested_settlement: settlementRecordId,
    ledger_document: JSON.parse(derived.frozen.canonicalJson),
    expected_canonical_hash: derived.canonicalHash,
    expected_ledger_hash: derived.frozen.ledgerHash,
    expected_plan_hash: derived.frozen.settlementId,
    target_chain_id: BASE_SEPOLIA_CHAIN_ID,
    target_contract_address: derived.contractAddress,
    transfer_rows: derived.transferRows,
    expected_transfer_hash: derived.transferHash,
    event_payload_hash: eventPayloadHash,
    server_attested_at: attestedAt,
    server_attestation: attestations.flowAttestation,
    server_event_attestation: attestations.eventAttestation,
  });
  if (rpc.error || !firstRpcRow(rpc.data)) throw new Error(`FLOW_FREEZE_COMMIT_FAILED: ${rpc.error?.message ?? "no row returned"}`);
  const committed = await getDurableSettlementFlow(client, flowId);
  if (!committed) throw new Error("FLOW_FREEZE_ATTESTATION_REJECTED");
  return { flow: committed.public, frozen: derived.frozen, idempotent: false };
}

export function assertDurableFlowContractConfigured(flow: { contract_address: string }): void {
  if (requiredV2SettlementContract().toLowerCase() !== flow.contract_address.toLowerCase()) {
    throw new Error("FLOW_FROZEN_CONTRACT_CONFIG_MISMATCH");
  }
}

function assertBodyMatchesFlow(body: SettleBody, flow: FlowRow): void {
  assertDurableFlowContractConfigured(flow);
  if (body.ledgerHash.toLowerCase() !== flow.ledger_hash.toLowerCase()) throw new Error("FLOW_LEDGER_HASH_MISMATCH");
  if (body.settlementId.toLowerCase() !== flow.plan_hash.toLowerCase()) throw new Error("FLOW_PLAN_HASH_MISMATCH");
}

async function approvalRows(client: SupabaseClient, flow: FlowRow, body: SettleBody) {
  const ledgerResult = await client
    .from("ledgers")
    .select("canonical_json")
    .eq("id", flow.ledger_id)
    .eq("tab_id", flow.tab_id)
    .maybeSingle();
  if (ledgerResult.error || !ledgerResult.data) throw new Error(`FLOW_LEDGER_READ_FAILED: ${ledgerResult.error?.message ?? "missing"}`);
  const ledger = record(ledgerResult.data.canonical_json);
  const participants = z.array(z.object({ id: UUID, address: ADDRESS, displayName: z.string() }).strict())
    .min(2).max(32).parse(ledger.participants);
  const participantByWallet = new Map(participants.map((participant) => [participant.address.toLowerCase(), participant.id]));
  return body.transfers.map((transfer) => {
    const participantId = participantByWallet.get(transfer.from.toLowerCase());
    if (!participantId) throw new Error("FLOW_SIGNER_NOT_IN_FROZEN_LEDGER");
    const expiresSeconds = Number(transfer.validBefore);
    if (!Number.isSafeInteger(expiresSeconds)) throw new Error("FLOW_APPROVAL_EXPIRY_INVALID");
    return {
      participantId,
      walletAddress: transfer.from.toLowerCase(),
      debitMinor: transfer.value,
      consentSignature: serializeSignature({
        r: transfer.consentR as `0x${string}`,
        s: transfer.consentS as `0x${string}`,
        v: BigInt(transfer.consentV),
      }),
      usdcAuthorization: {
        from: transfer.from.toLowerCase(),
        to: transfer.to.toLowerCase(),
        value: transfer.value,
        validAfter: transfer.validAfter,
        validBefore: transfer.validBefore,
        nonce: transfer.nonce.toLowerCase(),
        v: transfer.authV,
        r: transfer.authR.toLowerCase(),
        s: transfer.authS.toLowerCase(),
      },
      expiresAt: new Date(expiresSeconds * 1_000).toISOString(),
    };
  });
}

export async function persistSuccessfulSimulation(options: {
  client: SupabaseClient;
  mutationClient: SupabaseClient;
  userId: string;
  flow: { internal: FlowRow; public: DurableSettlementFlow };
  body: SettleBody;
  simulation: unknown;
}): Promise<DurableSettlementFlow> {
  const { client, mutationClient, userId, body, simulation } = options;
  const flow = options.flow.internal;
  if (!userId) throw new Error("FLOW_NOT_FOUND_OR_NOT_OWNED");
  assertBodyMatchesFlow(body, flow);
  const signedBodyHash = digest(body);
  const simulationHash = digest(simulation);
  if (flow.state !== "frozen") {
    if (flow.signed_body_hash === signedBodyHash && flow.simulation_hash === simulationHash) return options.flow.public;
    throw new Error("FLOW_SIMULATION_TRANSITION_REJECTED");
  }
  const approvals = await approvalRows(client, flow, body);
  const attestedAt = new Date().toISOString();
  const eventPayloadHash = digest({ signedBodyHash, simulationHash });
  const next = {
    ...flow,
    state: "simulated" as const,
    signed_body_hash: signedBodyHash,
    simulation_hash: simulationHash,
    revision: 2,
    attested_at: attestedAt,
  };
  const attestations = nextAttestations(next, "simulated", eventPayloadHash);
  const rpc = await mutationClient.rpc("record_reviewed_settlement_simulation", {
    target_flow: flow.id,
    expected_owner: userId,
    expected_revision: 2,
    signed_body_digest: signedBodyHash,
    simulation_digest: simulationHash,
    signed_approvals: approvals,
    simulation_record: simulation,
    event_payload_hash: eventPayloadHash,
    server_attested_at: attestedAt,
    server_attestation: attestations.flowAttestation,
    server_event_attestation: attestations.eventAttestation,
  });
  if (rpc.error || !firstRpcRow(rpc.data)) throw new Error(`FLOW_SIMULATION_COMMIT_FAILED: ${rpc.error?.message ?? "no row returned"}`);
  const committed = await getDurableSettlementFlow(client, flow.id);
  if (!committed) throw new Error("FLOW_SIMULATION_ATTESTATION_REJECTED");
  return committed.public;
}

export async function persistAcceptedExecution(options: {
  client: SupabaseClient;
  mutationClient: SupabaseClient;
  userId: string;
  flow: { internal: FlowRow; public: DurableSettlementFlow };
  body: SettleBody;
  accepted: Record<string, unknown> & { executionId: string };
}): Promise<DurableSettlementFlow> {
  const { client, mutationClient, userId, body, accepted } = options;
  const flow = options.flow.internal;
  if (!userId) throw new Error("FLOW_NOT_FOUND_OR_NOT_OWNED");
  assertBodyMatchesFlow(body, flow);
  const signedBodyHash = digest(body);
  const executionHash = digest(accepted);
  if (flow.state !== "simulated") {
    if (flow.execution_id === accepted.executionId && flow.execution_hash === executionHash) return options.flow.public;
    throw new Error("FLOW_EXECUTION_TRANSITION_REJECTED");
  }
  if (flow.signed_body_hash !== signedBodyHash || !flow.simulation_hash) throw new Error("FLOW_SIGNED_BODY_MISMATCH");
  const attestedAt = new Date().toISOString();
  const eventPayloadHash = digest({ executionId: accepted.executionId, executionHash });
  const next = {
    ...flow,
    state: "submitted" as const,
    execution_id: accepted.executionId,
    execution_hash: executionHash,
    execution_result: accepted,
    revision: 3,
    attested_at: attestedAt,
  };
  const attestations = nextAttestations(next, "submitted", eventPayloadHash);
  const rpc = await mutationClient.rpc("record_reviewed_settlement_execution", {
    target_flow: flow.id,
    expected_owner: userId,
    expected_revision: 3,
    signed_body_digest: signedBodyHash,
    simulation_digest: flow.simulation_hash,
    accepted_execution_id: accepted.executionId,
    execution_record: accepted,
    execution_digest: executionHash,
    event_payload_hash: eventPayloadHash,
    server_attested_at: attestedAt,
    server_attestation: attestations.flowAttestation,
    server_event_attestation: attestations.eventAttestation,
  });
  if (rpc.error || !firstRpcRow(rpc.data)) throw new Error(`FLOW_EXECUTION_COMMIT_FAILED: ${rpc.error?.message ?? "no row returned"}`);
  const committed = await getDurableSettlementFlow(client, flow.id);
  if (!committed) throw new Error("FLOW_EXECUTION_ATTESTATION_REJECTED");
  return committed.public;
}

export async function assertDurableApprovalsImmediatelyBeforeExecution(options: {
  mutationClient: SupabaseClient;
  userId: string;
  flow: { internal: FlowRow; public: DurableSettlementFlow };
  body: SettleBody;
}): Promise<void> {
  const { mutationClient, userId, body } = options;
  const flow = options.flow.internal;
  if (!userId || flow.state !== "simulated") throw new Error("FLOW_EXECUTION_APPROVAL_CHECK_REJECTED");
  assertBodyMatchesFlow(body, flow);
  const signedBodyHash = digest(body);
  if (flow.signed_body_hash !== signedBodyHash) throw new Error("FLOW_SIGNED_BODY_MISMATCH");
  const rpc = await mutationClient.rpc("assert_reviewed_settlement_approvals", {
    target_flow: flow.id,
    expected_owner: userId,
    signed_body_digest: signedBodyHash,
  });
  if (rpc.error || rpc.data !== true) {
    throw new Error(`FLOW_EXECUTION_APPROVAL_CHECK_FAILED: ${rpc.error?.message ?? "approval check returned false"}`);
  }
}

export function terminalProofRecord(options: {
  flow: FlowRow;
  status: ExecutionStatusResponse;
  verdict: Verdict;
  independent: IndependentExecutionProof | null;
}): Record<string, unknown> {
  return {
    verified: options.verdict.verdict === "VERIFIED_SETTLED" && options.independent?.verified === true,
    checkedAt: options.independent?.checkedAt ?? new Date().toISOString(),
    executionId: options.flow.execution_id,
    settlementId: options.flow.plan_hash.toLowerCase(),
    ledgerHash: options.flow.ledger_hash.toLowerCase(),
    contractAddress: options.flow.contract_address.toLowerCase(),
    chainId: BASE_SEPOLIA_CHAIN_ID,
    keeperHubVerdict: options.verdict.verdict,
    receiptHashes: Array.isArray(options.status.receipts) ? options.status.receipts.map((receipt) => receipt.hash.toLowerCase()) : [],
    independent: options.independent,
  };
}

export async function persistTerminalStatus(options: {
  client: SupabaseClient;
  mutationClient: SupabaseClient;
  userId: string;
  flow: { internal: FlowRow; public: DurableSettlementFlow };
  status: ExecutionStatusResponse;
  verdict: Verdict;
  independent: IndependentExecutionProof | null;
}): Promise<DurableSettlementFlow> {
  const { client, mutationClient, userId, status, verdict, independent } = options;
  const flow = options.flow.internal;
  if (!userId || !flow.execution_id) throw new Error("FLOW_NOT_FOUND_OR_NOT_OWNED");
  if (["completed_unverified", "verified_settled", "failed", "timeout"].includes(flow.state)) return options.flow.public;
  if (flow.state !== "submitted") throw new Error("FLOW_TERMINAL_TRANSITION_REJECTED");
  const targetState = settlementObservationTarget(status, verdict, independent);
  if (!targetState) throw new Error("FLOW_TERMINAL_REQUIRES_TERMINAL_PROVIDER_STATUS");
  const proof = terminalProofRecord({ flow, status, verdict, independent });
  const statusHash = digest(status);
  const proofHash = digest(proof);
  const attestedAt = new Date().toISOString();
  const eventPayloadHash = digest({ executionId: flow.execution_id, targetState, statusHash, proofHash });
  const next = {
    ...flow,
    state: targetState,
    keeperhub_status: status,
    keeperhub_status_hash: statusHash,
    independent_proof: proof,
    proof_hash: proofHash,
    revision: 4,
    attested_at: attestedAt,
  };
  const attestations = nextAttestations(next, "terminal", eventPayloadHash);
  const rpc = await mutationClient.rpc("record_reviewed_settlement_terminal", {
    target_flow: flow.id,
    expected_owner: userId,
    expected_revision: 4,
    accepted_execution_id: flow.execution_id,
    target_state: targetState,
    keeperhub_status_record: status,
    keeperhub_status_digest: statusHash,
    proof_record: proof,
    proof_digest: proofHash,
    event_payload_hash: eventPayloadHash,
    server_attested_at: attestedAt,
    server_attestation: attestations.flowAttestation,
    server_event_attestation: attestations.eventAttestation,
  });
  if (rpc.error || !firstRpcRow(rpc.data)) throw new Error(`FLOW_TERMINAL_COMMIT_FAILED: ${rpc.error?.message ?? "no row returned"}`);
  const committed = await getDurableSettlementFlow(client, flow.id);
  if (!committed) throw new Error("FLOW_TERMINAL_ATTESTATION_REJECTED");
  return committed.public;
}

/**
 * Re-checks an already terminal-but-unproven execution. This never broadcasts
 * and can only promote the exact frozen execution to verified_settled.
 */
export async function promoteDurableSettlementProof(options: {
  client: SupabaseClient;
  mutationClient: SupabaseClient;
  userId: string;
  flow: { internal: FlowRow; public: DurableSettlementFlow };
  status: ExecutionStatusResponse;
  verdict: Verdict;
  independent: IndependentExecutionProof;
}): Promise<DurableSettlementFlow> {
  const { client, mutationClient, userId, status, verdict, independent } = options;
  const flow = options.flow.internal;
  if (!userId || !flow.execution_id) throw new Error("FLOW_NOT_FOUND_OR_NOT_OWNED");
  if (flow.state === "verified_settled") return options.flow.public;
  if (!["completed_unverified", "timeout"].includes(flow.state) || flow.revision !== 4) {
    throw new Error("FLOW_RECONCILIATION_TRANSITION_REJECTED");
  }
  if (verdict.verdict !== "VERIFIED_SETTLED" || independent.verified !== true) {
    throw new Error("FLOW_RECONCILIATION_REQUIRES_VERIFIED_PROOF");
  }
  const proof = terminalProofRecord({ flow, status, verdict, independent });
  const statusHash = digest(status);
  const proofHash = digest(proof);
  const attestedAt = new Date().toISOString();
  const eventPayloadHash = digest({ executionId: flow.execution_id, targetState: "verified_settled", statusHash, proofHash, reconciliation: true });
  const next = {
    ...flow,
    state: "verified_settled" as const,
    keeperhub_status: status,
    keeperhub_status_hash: statusHash,
    independent_proof: proof,
    proof_hash: proofHash,
    revision: 5,
    attested_at: attestedAt,
  };
  const attestations = nextAttestations(next, "reconciled", eventPayloadHash);
  const rpc = await mutationClient.rpc("reconcile_reviewed_settlement_proof", {
    target_flow: flow.id,
    expected_owner: userId,
    expected_revision: 5,
    accepted_execution_id: flow.execution_id,
    keeperhub_status_record: status,
    keeperhub_status_digest: statusHash,
    proof_record: proof,
    proof_digest: proofHash,
    event_payload_hash: eventPayloadHash,
    server_attested_at: attestedAt,
    server_attestation: attestations.flowAttestation,
    server_event_attestation: attestations.eventAttestation,
  });
  if (rpc.error || !firstRpcRow(rpc.data)) throw new Error(`FLOW_RECONCILIATION_COMMIT_FAILED: ${rpc.error?.message ?? "no row returned"}`);
  const committed = await getDurableSettlementFlow(client, flow.id);
  if (!committed) throw new Error("FLOW_RECONCILIATION_ATTESTATION_REJECTED");
  return committed.public;
}

export const settlementFlowInternals = {
  canonicalJson,
  digest,
  deterministicUuid,
  eventAttestationPayload,
  eventIsAttested,
  flowAttestationPayload,
  rowIsAttested,
  sign,
  terminalProofRecord,
  verifiedFlow,
};
