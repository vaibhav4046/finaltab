import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  AllocationProposalSchema,
  BASE_SEPOLIA_CHAIN_ID,
  ParsedReceiptSchema,
  aggregateSettlementTransfers,
  checkReceiptArithmetic,
  isSettlementCurrency,
  nettedTransfers,
  parseFiat,
  reconcileAllocation,
  sharesToDebts,
  type AllocationProposal,
} from "@finaltab/engine";
import {
  DEFAULT_GROQ_MODEL,
  GroqClient,
  proposeAllocation,
  type GroqTokenUsage,
} from "@finaltab/vision";
import type {
  SettlementAgentEvent,
  SettlementAgentMemory,
  SettlementAgentRun,
  SettlementAgentRunDetail,
  SettlementAgentRunStatus,
  SettlementAgentStage,
  SettlementAgentStageStatus,
  SettlementBalanceRow,
} from "@/lib/agentControl";

const MAX_AMOUNT_CHARACTERS = 18;
const MODEL_TIMEOUT_MS = 8_000;
const MODEL_WALL_TIMEOUT_MS = 28_000;
const MEMORY_RETENTION_DAYS = 179;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const BoundedReceiptSchema = ParsedReceiptSchema.superRefine((receipt, context) => {
  const amounts = [
    receipt.total,
    receipt.subtotal,
    receipt.tax,
    receipt.tip,
    receipt.serviceCharge,
    ...receipt.items.flatMap((item) => [item.unitPrice, item.lineTotal]),
  ].filter((value): value is string => value !== null);
  if (amounts.some((value) => value.length > MAX_AMOUNT_CHARACTERS)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `amount fields are limited to ${MAX_AMOUNT_CHARACTERS} characters`,
    });
  }
});

const BoundedAllocationProposalSchema = AllocationProposalSchema.superRefine((proposal, context) => {
  if (proposal.allocations.length > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "allocation entries are limited to 100" });
  }
  if (proposal.allocations.some((allocation) => allocation.participants.length > 32)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "participants per allocation are limited to 32" });
  }
  if (proposal.allocations.some((allocation) => (allocation.weights?.length ?? 0) > 32)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "weights per allocation are limited to 32" });
  }
});

export const StartSettlementAgentRunSchema = z.object({
  tabId: z.string().uuid(),
  receipt: BoundedReceiptSchema,
  receiptConfirmed: z.literal(true),
  payerParticipantId: z.string().uuid(),
  instruction: z.string().trim().min(1).max(2_000),
  extractionProvider: z.string().trim().min(1).max(80).optional(),
  extractionAttempts: z.number().int().min(1).max(3).optional().default(1),
  existingProposal: BoundedAllocationProposalSchema.optional(),
}).strict();

export type StartSettlementAgentRunInput = z.infer<typeof StartSettlementAgentRunSchema>;

interface TabRow {
  id: string;
  currency: string;
  payer_participant_id: string | null;
  status: string;
}

interface ParticipantRow {
  id: string;
  display_name: string;
  wallet_address: string | null;
}

export function walletBackedParticipantSnapshot(
  participants: ReadonlyArray<Pick<ParticipantRow, "id" | "display_name" | "wallet_address">>,
): Array<{ id: string; name: string; walletAddress: `0x${string}` }> {
  return participants.flatMap((participant) => ADDRESS_RE.test(participant.wallet_address ?? "")
    ? [{
        id: participant.id,
        name: participant.display_name,
        walletAddress: participant.wallet_address!.toLowerCase() as `0x${string}`,
      }]
    : []);
}

interface RunRow {
  id: string;
  owner_id: string;
  tab_id: string;
  input_hash: string;
  chain_adapter: "base-sepolia";
  status: SettlementAgentRunStatus;
  stage_count: number;
  model_provider: string | null;
  model_name: string | null;
  model_usage: unknown;
  model_cost_microusd: number | string | null;
  result_summary: unknown;
  terminal_code: string | null;
  attested_at: string;
  attestation: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: number | string;
  run_id: string;
  sequence: number;
  stage: SettlementAgentStage;
  status: SettlementAgentStageStatus;
  deterministic: boolean;
  input_hash: string;
  output_summary: unknown;
  model_provider: string | null;
  model_name: string | null;
  model_usage: unknown;
  model_cost_microusd: number | string | null;
  duration_ms: number;
  attested_at: string;
  attestation: string;
  created_at: string;
}

interface MemoryRow {
  id: string;
  owner_id: string;
  tab_id: string;
  source_run_id: string | null;
  memory_key: string;
  content_hash: string;
  summary: unknown;
  revision: number;
  expires_at: string;
  attested_at: string;
  attestation: string;
  created_at: string;
  updated_at: string;
}

interface StageRecord {
  status: SettlementAgentStageStatus;
  output: Record<string, unknown>;
  durationMs: number;
  provider?: string;
  model?: string;
  usage?: GroqTokenUsage;
}

interface RunContext {
  receiptId: string | null;
  allocationId: string | null;
  proposal: AllocationProposal | null;
  shares: Map<string, bigint> | null;
  debts: ReturnType<typeof sharesToDebts>;
  balanceSheet: SettlementBalanceRow[];
  modelProvider: string | null;
  modelName: string | null;
  modelUsage: GroqTokenUsage;
  modelAttempts: number;
  terminalCode: string;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function cleanupExpiredSettlementAgentMemory(client: SupabaseClient): Promise<void> {
  const result = await client.rpc("delete_expired_settlement_agent_memory");
  if (result.error) {
    throw new Error(`AGENT_MEMORY_RETENTION_CLEANUP_FAILED: ${result.error.message}`);
  }
}

function numericRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(objectRecord(value)).filter((entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0,
    ),
  );
}

export function mapAgentRun(row: RunRow): SettlementAgentRun {
  return {
    id: row.id,
    ownerId: row.owner_id,
    tabId: row.tab_id,
    inputHash: row.input_hash,
    chainAdapter: row.chain_adapter,
    status: row.status,
    stageCount: Number(row.stage_count),
    modelProvider: row.model_provider,
    modelName: row.model_name,
    modelUsage: numericRecord(row.model_usage),
    modelCostMicrousd: row.model_cost_microusd === null ? null : String(row.model_cost_microusd),
    resultSummary: objectRecord(row.result_summary),
    terminalCode: row.terminal_code,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentEvent(row: EventRow): SettlementAgentEvent {
  return {
    id: String(row.id),
    runId: row.run_id,
    sequence: Number(row.sequence),
    stage: row.stage,
    status: row.status,
    deterministic: row.deterministic,
    inputHash: row.input_hash,
    outputSummary: objectRecord(row.output_summary),
    modelProvider: row.model_provider,
    modelName: row.model_name,
    modelUsage: numericRecord(row.model_usage),
    modelCostMicrousd: row.model_cost_microusd === null ? null : String(row.model_cost_microusd),
    durationMs: Number(row.duration_ms),
    createdAt: row.created_at,
  };
}

function mapAgentMemory(row: MemoryRow): SettlementAgentMemory {
  return {
    id: row.id,
    tabId: row.tab_id,
    sourceRunId: row.source_run_id,
    memoryKey: row.memory_key,
    contentHash: row.content_hash,
    summary: objectRecord(row.summary),
    revision: Number(row.revision),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function requiredAttestationSecret(): string {
  const secret = process.env.FINALTAB_AGENT_ATTESTATION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("AGENT_ATTESTATION_NOT_CONFIGURED");
  }
  return secret;
}

function signAttestation(payload: Record<string, unknown>): string {
  return createHmac("sha256", requiredAttestationSecret())
    .update(canonicalJson(payload))
    .digest("hex");
}

function verifyAttestation(signature: string, payload: Record<string, unknown>): boolean {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signAttestation(payload), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function canonicalTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("INVALID_ATTESTATION_TIME");
  return date.toISOString();
}

function activeRunAttestationPayload(input: {
  runId: string;
  ownerId: string;
  tabId: string;
  inputHash: string;
  status: "running";
  stageCount: number;
  modelProvider: string | null;
  modelName: string | null;
  modelUsage: unknown;
  modelCostMicrousd: string | null;
  attestedAt: string;
}): Record<string, unknown> {
  return {
    version: 1,
    kind: "settlement-agent-run-active",
    runId: input.runId,
    ownerId: input.ownerId,
    tabId: input.tabId,
    inputHash: input.inputHash,
    status: input.status,
    stageCount: input.stageCount,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    modelUsage: numericRecord(input.modelUsage),
    modelCostMicrousd: input.modelCostMicrousd,
    attestedAt: canonicalTime(input.attestedAt),
  };
}

function terminalRunAttestationPayload(input: {
  runId: string;
  ownerId: string;
  tabId: string;
  inputHash: string;
  status: SettlementAgentRunStatus;
  stageCount: number;
  resultSummary: unknown;
  terminalCode: string | null;
  modelProvider: string | null;
  modelName: string | null;
  modelUsage: unknown;
  modelCostMicrousd: string | null;
  attestedAt: string;
}): Record<string, unknown> {
  return {
    version: 1,
    kind: "settlement-agent-run-terminal",
    runId: input.runId,
    ownerId: input.ownerId,
    tabId: input.tabId,
    inputHash: input.inputHash,
    status: input.status,
    stageCount: input.stageCount,
    resultHash: digest(input.resultSummary),
    terminalCode: input.terminalCode,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    modelUsage: numericRecord(input.modelUsage),
    modelCostMicrousd: input.modelCostMicrousd,
    attestedAt: canonicalTime(input.attestedAt),
  };
}

function runRowIsAttested(row: RunRow): boolean {
  const terminal = ["ready", "verified", "blocked", "failed", "cancelled"].includes(row.status);
  if (!terminal && row.status !== "running") return false;
  const payload = terminal
    ? terminalRunAttestationPayload({
        runId: row.id,
        ownerId: row.owner_id,
        tabId: row.tab_id,
        inputHash: row.input_hash,
        status: row.status,
        stageCount: Number(row.stage_count),
        resultSummary: row.result_summary,
        terminalCode: row.terminal_code,
        modelProvider: row.model_provider,
        modelName: row.model_name,
        modelUsage: row.model_usage,
        modelCostMicrousd: row.model_cost_microusd === null ? null : String(row.model_cost_microusd),
        attestedAt: row.attested_at,
      })
    : activeRunAttestationPayload({
        runId: row.id,
        ownerId: row.owner_id,
        tabId: row.tab_id,
        inputHash: row.input_hash,
        status: "running",
        stageCount: Number(row.stage_count),
        modelProvider: row.model_provider,
        modelName: row.model_name,
        modelUsage: row.model_usage,
        modelCostMicrousd: row.model_cost_microusd === null ? null : String(row.model_cost_microusd),
        attestedAt: row.attested_at,
      });
  return verifyAttestation(row.attestation, payload);
}

function eventAttestationPayload(input: {
  run: RunRow;
  sequence: number;
  stage: SettlementAgentStage;
  status: SettlementAgentStageStatus;
  stageInputHash: string;
  output: unknown;
  provider: string | null;
  model: string | null;
  usage: unknown;
  costMicrousd: string | null;
  durationMs: number;
  attestedAt: string;
}): Record<string, unknown> {
  return {
    version: 1,
    kind: "settlement-agent-stage",
    runId: input.run.id,
    ownerId: input.run.owner_id,
    tabId: input.run.tab_id,
    runInputHash: input.run.input_hash,
    sequence: input.sequence,
    stage: input.stage,
    status: input.status,
    stageInputHash: input.stageInputHash,
    outputHash: digest(input.output),
    provider: input.provider,
    model: input.model,
    usage: numericRecord(input.usage),
    costMicrousd: input.costMicrousd,
    durationMs: input.durationMs,
    attestedAt: canonicalTime(input.attestedAt),
  };
}

function eventRowIsAttested(run: RunRow, row: EventRow): boolean {
  return verifyAttestation(row.attestation, eventAttestationPayload({
    run,
    sequence: Number(row.sequence),
    stage: row.stage,
    status: row.status,
    stageInputHash: row.input_hash,
    output: row.output_summary,
    provider: row.model_provider,
    model: row.model_name,
    usage: row.model_usage,
    costMicrousd: row.model_cost_microusd === null ? null : String(row.model_cost_microusd),
    durationMs: Number(row.duration_ms),
    attestedAt: row.attested_at,
  }));
}

function memoryAttestationPayload(input: {
  ownerId: string;
  tabId: string;
  sourceRunId: string | null;
  memoryKey: string;
  contentHash: string;
  summary: unknown;
  revision: number;
  expiresAt: string;
  attestedAt: string;
}): Record<string, unknown> {
  return {
    version: 1,
    kind: "settlement-agent-memory",
    ownerId: input.ownerId,
    tabId: input.tabId,
    sourceRunId: input.sourceRunId,
    memoryKey: input.memoryKey,
    contentHash: input.contentHash,
    summaryHash: digest(input.summary),
    revision: input.revision,
    expiresAt: canonicalTime(input.expiresAt),
    attestedAt: canonicalTime(input.attestedAt),
  };
}

function memoryRowIsAttested(row: MemoryRow): boolean {
  return verifyAttestation(row.attestation, memoryAttestationPayload({
    ownerId: row.owner_id,
    tabId: row.tab_id,
    sourceRunId: row.source_run_id,
    memoryKey: row.memory_key,
    contentHash: row.content_hash,
    summary: row.summary,
    revision: Number(row.revision),
    expiresAt: row.expires_at,
    attestedAt: row.attested_at,
  }));
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown failure";
  return message.replace(/sk_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 300);
}

function firstRpcRow<T>(data: unknown): T | null {
  return Array.isArray(data) && data.length > 0 ? data[0] as T : null;
}

async function withWallTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`MODEL_TIMEOUT after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function recordStage(
  mutationClient: SupabaseClient,
  run: RunRow,
  sequence: number,
  stage: SettlementAgentStage,
  record: StageRecord,
): Promise<void> {
  const stageInputHash = digest({ runHash: run.input_hash, sequence, stage });
  const durationMs = Math.max(0, Math.min(60_000, Math.round(record.durationMs)));
  const attestedAt = new Date().toISOString();
  const provider = record.provider ?? null;
  const model = record.model ?? null;
  const usage = record.usage ?? {};
  const attestation = signAttestation(eventAttestationPayload({
    run,
    sequence,
    stage,
    status: record.status,
    stageInputHash,
    output: record.output,
    provider,
    model,
    usage,
    costMicrousd: null,
    durationMs,
    attestedAt,
  }));
  const { error } = await mutationClient.rpc("record_settlement_agent_stage", {
    target_run: run.id,
    expected_owner: run.owner_id,
    target_sequence: sequence,
    target_stage: stage,
    target_status: record.status,
    stage_input_hash: stageInputHash,
    stage_output: record.output,
    provider_name: provider,
    provider_model: model,
    provider_usage: usage,
    provider_cost_microusd: null,
    elapsed_ms: durationMs,
    server_attested_at: attestedAt,
    server_attestation: attestation,
  });
  if (error) throw new Error(`AGENT_STAGE_COMMIT_FAILED: ${error.message}`);
}

async function persistConfirmedReceipt(
  client: SupabaseClient,
  tabId: string,
  userId: string,
  input: StartSettlementAgentRunInput,
): Promise<string> {
  const receipt = input.receipt;
  const { data, error } = await client
    .from("receipts")
    .insert({
      tab_id: tabId,
      image_path: null,
      raw_extraction: receipt,
      merchant: receipt.merchant,
      subtotal_minor: receipt.subtotal === null ? null : parseFiat(receipt.subtotal).toString(),
      tax_minor: receipt.tax === null ? null : parseFiat(receipt.tax).toString(),
      tip_minor: receipt.tip === null ? null : parseFiat(receipt.tip).toString(),
      service_charge_minor: receipt.serviceCharge === null ? null : parseFiat(receipt.serviceCharge).toString(),
      total_minor: parseFiat(receipt.total).toString(),
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
      extraction_provider: input.extractionProvider ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`RECEIPT_COMMIT_FAILED: ${error?.message ?? "no row returned"}`);

  const items = receipt.items.map((item, position) => ({
    receipt_id: data.id,
    position,
    label: item.description,
    quantity: item.quantity,
    amount_minor: parseFiat(item.lineTotal).toString(),
  }));
  const itemResult = await client.from("receipt_items").insert(items);
  if (itemResult.error) {
    await client.from("receipts").delete().eq("id", data.id);
    throw new Error(`RECEIPT_ITEMS_COMMIT_FAILED: ${itemResult.error.message}`);
  }
  return data.id as string;
}

async function persistAllocation(
  client: SupabaseClient,
  tabId: string,
  instruction: string,
  proposal: AllocationProposal,
  shares: Map<string, bigint>,
): Promise<string> {
  const reconciled = Object.fromEntries(
    [...shares.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, amount]) => [id, amount.toString()]),
  );
  const { data, error } = await client
    .from("allocations")
    .insert({
      tab_id: tabId,
      instruction,
      model_proposal: proposal,
      reconciled_shares: reconciled,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`ALLOCATION_COMMIT_FAILED: ${error?.message ?? "no row returned"}`);
  return data.id as string;
}

function buildBalanceSheet(
  participants: ParticipantRow[],
  shares: Map<string, bigint>,
  payerId: string,
  totalMinor: bigint,
): SettlementBalanceRow[] {
  return participants
    .filter((participant) => shares.has(participant.id) || participant.id === payerId)
    .map((participant) => {
      const share = shares.get(participant.id) ?? 0n;
      const paid = participant.id === payerId ? totalMinor : 0n;
      const net = paid - share;
      return {
        participantId: participant.id,
        displayName: participant.display_name,
        walletAddress: ADDRESS_RE.test(participant.wallet_address ?? "")
          ? participant.wallet_address!.toLowerCase() as `0x${string}`
          : null,
        shareMinor: share.toString(),
        paidMinor: paid.toString(),
        netMinor: net.toString(),
        position: net > 0n ? "receivable" as const : net < 0n ? "payable" as const : "settled" as const,
        approvalState: "not_frozen" as const,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function getSettlementAgentRun(
  client: SupabaseClient,
  runId: string,
): Promise<SettlementAgentRunDetail | null> {
  const runResult = await client
    .from("settlement_agent_runs")
    .select("id,owner_id,tab_id,input_hash,chain_adapter,status,stage_count,model_provider,model_name,model_usage,model_cost_microusd,result_summary,terminal_code,attested_at,attestation,started_at,completed_at,created_at,updated_at")
    .eq("id", runId)
    .maybeSingle();
  if (runResult.error) throw new Error(`AGENT_RUN_READ_FAILED: ${runResult.error.message}`);
  if (!runResult.data) return null;
  const run = runResult.data as RunRow;
  if (!runRowIsAttested(run)) return null;
  await cleanupExpiredSettlementAgentMemory(client);
  const [eventsResult, memoryResult] = await Promise.all([
    client
      .from("settlement_agent_events")
      .select("id,run_id,sequence,stage,status,deterministic,input_hash,output_summary,model_provider,model_name,model_usage,model_cost_microusd,duration_ms,attested_at,attestation,created_at")
      .eq("run_id", runId)
      .order("sequence", { ascending: true }),
    client
      .from("settlement_agent_memory")
      .select("id,owner_id,tab_id,source_run_id,memory_key,content_hash,summary,revision,expires_at,attested_at,attestation,created_at,updated_at")
      .eq("source_run_id", runId)
      .gt("expires_at", new Date().toISOString())
      .order("updated_at", { ascending: false }),
  ]);
  if (eventsResult.error || memoryResult.error) {
    throw new Error(`AGENT_RUN_DETAIL_FAILED: ${eventsResult.error?.message ?? memoryResult.error?.message}`);
  }
  const events = (eventsResult.data ?? []) as EventRow[];
  if (events.length !== Number(run.stage_count) || events.some((event) => !eventRowIsAttested(run, event))) {
    return null;
  }
  const memory = ((memoryResult.data ?? []) as MemoryRow[]).filter(memoryRowIsAttested);
  return {
    ...mapAgentRun(run),
    events: events.map(mapAgentEvent),
    memory: memory.map(mapAgentMemory),
  };
}

/**
 * Settlement persistence needs the exact input snapshot that was hashed before
 * the bounded agents ran. The public run DTO deliberately omits this larger
 * record, so this server-only accessor re-checks both the run HMAC and the
 * content digest before returning it.
 */
export async function getSettlementAgentPersistenceContext(
  client: SupabaseClient,
  runId: string,
): Promise<{
  run: SettlementAgentRunDetail;
  inputRecord: Record<string, unknown>;
  runSnapshot: Record<string, unknown>;
} | null> {
  const [run, inputResult] = await Promise.all([
    getSettlementAgentRun(client, runId),
    client
      .from("settlement_agent_runs")
      .select("input_snapshot,attested_at,attestation")
      .eq("id", runId)
      .maybeSingle(),
  ]);
  if (inputResult.error) throw new Error(`AGENT_RUN_INPUT_READ_FAILED: ${inputResult.error.message}`);
  if (!run || !inputResult.data) return null;
  const inputRecord = objectRecord(inputResult.data.input_snapshot);
  if (digest(inputRecord) !== run.inputHash) return null;
  const runSnapshot = {
    version: 1,
    id: run.id,
    ownerId: run.ownerId,
    tabId: run.tabId,
    inputHash: run.inputHash,
    inputSnapshot: inputRecord,
    status: run.status,
    stageCount: run.stageCount,
    resultSummary: run.resultSummary,
    attestedAt: inputResult.data.attested_at,
    attestation: inputResult.data.attestation,
  };
  return { run, inputRecord, runSnapshot };
}

export async function listSettlementAgentRuns(
  client: SupabaseClient,
  options: { tabId?: string; limit?: number } = {},
): Promise<SettlementAgentRun[]> {
  let query = client
    .from("settlement_agent_runs")
    .select("id,owner_id,tab_id,input_hash,chain_adapter,status,stage_count,model_provider,model_name,model_usage,model_cost_microusd,result_summary,terminal_code,attested_at,attestation,started_at,completed_at,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, options.limit ?? 20)));
  if (options.tabId) query = query.eq("tab_id", options.tabId);
  const { data, error } = await query;
  if (error) throw new Error(`AGENT_RUN_LIST_FAILED: ${error.message}`);
  return ((data ?? []) as RunRow[]).filter(runRowIsAttested).map(mapAgentRun);
}

export async function listSettlementAgentMemory(
  client: SupabaseClient,
  tabId?: string,
): Promise<SettlementAgentMemory[]> {
  await cleanupExpiredSettlementAgentMemory(client);
  let query = client
    .from("settlement_agent_memory")
    .select("id,owner_id,tab_id,source_run_id,memory_key,content_hash,summary,revision,expires_at,attested_at,attestation,created_at,updated_at")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(50);
  if (tabId) query = query.eq("tab_id", tabId);
  const { data, error } = await query;
  if (error) throw new Error(`AGENT_MEMORY_LIST_FAILED: ${error.message}`);
  return ((data ?? []) as MemoryRow[]).filter(memoryRowIsAttested).map(mapAgentMemory);
}

function terminalMemorySummary(run: SettlementAgentRunDetail): Record<string, unknown> {
  const result = objectRecord(run.resultSummary);
  return {
    runId: run.id,
    status: run.status,
    inputHash: run.inputHash,
    completedAt: run.completedAt,
    merchant: result.merchant ?? null,
    currency: result.currency ?? null,
    totalMinor: result.totalMinor ?? null,
    participantCount: result.participantCount ?? null,
    terminalCode: run.terminalCode,
    invariants: objectRecord(result.invariants),
    balanceSheet: Array.isArray(result.balanceSheet) ? result.balanceSheet : [],
  };
}

function shouldReplaceLatestMemory(
  prior: MemoryRow | null,
  run: SettlementAgentRunDetail,
  expectedContentHash: string,
): boolean {
  if (!prior || !memoryRowIsAttested(prior)) return true;
  if (prior.source_run_id === run.id && prior.content_hash === expectedContentHash) return false;

  // A deduped retry of an older run must not roll the tab's compact summary
  // backwards after a newer terminal run has already won the CAS.
  const priorCompleted = objectRecord(prior.summary).completedAt;
  const priorMs = typeof priorCompleted === "string" ? Date.parse(priorCompleted) : Number.NaN;
  const runMs = run.completedAt ? Date.parse(run.completedAt) : Number.NaN;
  return !Number.isFinite(priorMs) || !Number.isFinite(runMs) || runMs > priorMs;
}

async function readLatestMemoryRow(
  client: SupabaseClient,
  userId: string,
  tabId: string,
): Promise<MemoryRow | null> {
  const result = await client
    .from("settlement_agent_memory")
    .select("id,owner_id,tab_id,source_run_id,memory_key,content_hash,summary,revision,expires_at,attested_at,attestation,created_at,updated_at")
    .eq("owner_id", userId)
    .eq("tab_id", tabId)
    .eq("memory_key", "latest.settlement_review")
    .maybeSingle();
  if (result.error) throw new Error(`AGENT_MEMORY_REVISION_READ_FAILED: ${result.error.message}`);
  return result.data ? result.data as MemoryRow : null;
}

/**
 * Memory is a compact audit summary, not an execution dependency. A terminal
 * run therefore remains terminal if two completions race for the single
 * "latest" key. We retry the compare-and-swap, preserve the newer completion,
 * and let a later content-hash dedupe repair a genuinely missing row.
 */
async function ensureTerminalRunMemory(
  client: SupabaseClient,
  mutationClient: SupabaseClient,
  userId: string,
  run: SettlementAgentRunDetail,
): Promise<void> {
  if (!run.completedAt || !["ready", "verified", "blocked", "failed", "cancelled"].includes(run.status)) return;
  await cleanupExpiredSettlementAgentMemory(client);
  const summary = terminalMemorySummary(run);
  const memoryHash = digest(summary);
  let lastRaceMessage = "memory compare-and-swap did not converge";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prior = await readLatestMemoryRow(client, userId, run.tabId);
    if (!shouldReplaceLatestMemory(prior, run, memoryHash)) return;
    const memoryRevision = prior ? Number(prior.revision) + 1 : 1;
    const retainUntil = new Date(Date.now() + MEMORY_RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString();
    const memoryAttestedAt = new Date().toISOString();
    const memoryAttestation = signAttestation(memoryAttestationPayload({
      ownerId: userId,
      tabId: run.tabId,
      sourceRunId: run.id,
      memoryKey: "latest.settlement_review",
      contentHash: memoryHash,
      summary,
      revision: memoryRevision,
      expiresAt: retainUntil,
      attestedAt: memoryAttestedAt,
    }));
    const memoryResult = await mutationClient.rpc("remember_settlement_agent_run", {
      target_run: run.id,
      expected_owner: userId,
      target_memory_key: "latest.settlement_review",
      memory_hash: memoryHash,
      memory_summary: summary,
      retain_until: retainUntil,
      requested_revision: memoryRevision,
      server_attested_at: memoryAttestedAt,
      server_attestation: memoryAttestation,
    });
    if (!memoryResult.error) return;
    lastRaceMessage = memoryResult.error.message;
    if (!/revision|compare-and-swap|commit race/i.test(lastRaceMessage)) {
      throw new Error(`AGENT_MEMORY_COMMIT_FAILED: ${lastRaceMessage}`);
    }
  }

  const winner = await readLatestMemoryRow(client, userId, run.tabId);
  if (winner && memoryRowIsAttested(winner)) return;
  throw new Error(`AGENT_MEMORY_COMMIT_FAILED: ${lastRaceMessage}`);
}

export async function runSettlementAgents(options: {
  client: SupabaseClient;
  mutationClient: SupabaseClient;
  userId: string;
  input: StartSettlementAgentRunInput;
}): Promise<{ run: SettlementAgentRunDetail; deduped: boolean }> {
  const { client, mutationClient, userId, input } = options;
  const [tabResult, participantsResult] = await Promise.all([
    client
      .from("tabs")
      .select("id,currency,payer_participant_id,status")
      .eq("id", input.tabId)
      .maybeSingle(),
    client
      .from("participants")
      .select("id,display_name,wallet_address")
      .eq("tab_id", input.tabId)
      .order("created_at", { ascending: true }),
  ]);
  if (tabResult.error || participantsResult.error) {
    throw new Error(`AGENT_CONTEXT_READ_FAILED: ${tabResult.error?.message ?? participantsResult.error?.message}`);
  }
  if (!tabResult.data) throw new Error("TAB_NOT_FOUND_OR_NOT_SHARED");
  const tab = tabResult.data as TabRow;
  const participants = (participantsResult.data ?? []) as ParticipantRow[];
  if (participants.length < 2 || participants.length > 32) {
    throw new Error("PARTICIPANT_COUNT_OUT_OF_BOUNDS: use 2 to 32 durable tab participants");
  }
  if (!participants.some((participant) => participant.id === input.payerParticipantId)) {
    throw new Error("PAYER_NOT_IN_TAB");
  }

  const participantSnapshot = walletBackedParticipantSnapshot(participants);
  if (participantSnapshot.length < 2 || participantSnapshot.length > 32) {
    throw new Error("WALLET_PARTICIPANT_COUNT_OUT_OF_BOUNDS: attach 2 to 32 participant wallets before review");
  }
  if (!participantSnapshot.some((participant) => participant.id === input.payerParticipantId)) {
    throw new Error("PAYER_WALLET_NOT_ATTACHED");
  }
  const inputSnapshot = {
    version: 1,
    tabId: input.tabId,
    receipt: input.receipt,
    receiptConfirmed: true,
    payerParticipantId: input.payerParticipantId,
    instruction: input.instruction,
    extractionProvider: input.extractionProvider ?? null,
    extractionAttempts: input.extractionAttempts,
    participants: participantSnapshot,
    existingProposal: input.existingProposal ?? null,
    chainAdapter: "base-sepolia",
    maxStages: 4,
  };
  const runHash = digest(inputSnapshot);
  const requestedRunId = randomUUID();
  const beginAttestedAt = new Date().toISOString();
  const beginAttestation = signAttestation(activeRunAttestationPayload({
    runId: requestedRunId,
    ownerId: userId,
    tabId: input.tabId,
    inputHash: runHash,
    status: "running",
    stageCount: 0,
    modelProvider: null,
    modelName: null,
    modelUsage: {},
    modelCostMicrousd: null,
    attestedAt: beginAttestedAt,
  }));
  const beginResult = await mutationClient.rpc("begin_settlement_agent_run", {
    requested_run: requestedRunId,
    target_tab: input.tabId,
    expected_owner: userId,
    request_hash: runHash,
    input_record: inputSnapshot,
    server_attested_at: beginAttestedAt,
    server_attestation: beginAttestation,
  });
  if (beginResult.error) throw new Error(`AGENT_RUN_BEGIN_FAILED: ${beginResult.error.message}`);
  const begun = firstRpcRow<RunRow>(beginResult.data);
  if (!begun) throw new Error("AGENT_RUN_BEGIN_FAILED: no run returned");
  const deduped = begun.id !== requestedRunId;
  if (deduped) {
    const existing = await getSettlementAgentRun(client, begun.id);
    if (!existing) throw new Error("AGENT_RUN_DEDUPE_READ_FAILED");
    await ensureTerminalRunMemory(client, mutationClient, userId, existing);
    const repaired = await getSettlementAgentRun(client, begun.id);
    if (!repaired) throw new Error("AGENT_RUN_DEDUPE_READ_FAILED");
    return { run: repaired, deduped: true };
  }

  const context: RunContext = {
    receiptId: null,
    allocationId: null,
    proposal: null,
    shares: null,
    debts: [],
    balanceSheet: [],
    modelProvider: null,
    modelName: null,
    modelUsage: {},
    modelAttempts: 0,
    terminalCode: "READY_FOR_SIGNATURES",
  };

  let upstreamPassed = true;

  // 1. Extraction validator: deterministic schema/arithmetic plus a durable,
  // human-confirmed receipt and line-item record.
  let started = Date.now();
  let extractionStage: StageRecord;
  try {
    const issues = checkReceiptArithmetic(input.receipt);
    if (tab.currency !== input.receipt.currency) {
      extractionStage = {
        status: "blocked",
        durationMs: Date.now() - started,
        output: {
          code: "TAB_RECEIPT_CURRENCY_MISMATCH",
          tabCurrency: tab.currency,
          receiptCurrency: input.receipt.currency,
          arithmeticIssueCount: issues.length,
        },
      };
      context.terminalCode = "TAB_RECEIPT_CURRENCY_MISMATCH";
      upstreamPassed = false;
    } else if (issues.length > 0) {
      extractionStage = {
        status: "blocked",
        durationMs: Date.now() - started,
        output: {
          code: "RECEIPT_ARITHMETIC_REJECTED",
          arithmeticIssueCount: issues.length,
          issueCodes: issues.map((issue) => issue.code),
        },
      };
      context.terminalCode = "RECEIPT_ARITHMETIC_REJECTED";
      upstreamPassed = false;
    } else {
      context.receiptId = await persistConfirmedReceipt(client, input.tabId, userId, input);
      extractionStage = {
        status: "passed",
        durationMs: Date.now() - started,
        output: {
          receiptId: context.receiptId,
          arithmeticIssueCount: 0,
          currency: input.receipt.currency,
          totalMinor: parseFiat(input.receipt.total).toString(),
          humanConfirmed: true,
        },
      };
    }
  } catch (error) {
    extractionStage = {
      status: "failed",
      durationMs: Date.now() - started,
      output: { code: "EXTRACTION_STAGE_FAILED", message: safeMessage(error) },
    };
    context.terminalCode = "EXTRACTION_STAGE_FAILED";
    upstreamPassed = false;
  }
  await recordStage(mutationClient, begun, 1, "extraction_validation", extractionStage);

  // 2. Allocation agent: either reuse the already-generated structured
  // proposal or call Groq once per content hash, then let the bigint reconciler
  // decide every unit. No raw model prose is persisted or trusted.
  started = Date.now();
  let allocationStage: StageRecord = {
    status: "skipped",
    durationMs: 0,
    output: { code: "ALLOCATION_NOT_STARTED" },
  };
  if (!upstreamPassed) {
    allocationStage = {
      status: "skipped",
      durationMs: 0,
      output: { code: "UPSTREAM_STAGE_NOT_PASSED", reason: "Receipt validation did not pass." },
    };
  } else {
    try {
      let proposal = input.existingProposal;
      let source: "existing_proposal" | "groq" = "existing_proposal";
      if (!proposal) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          allocationStage = {
            status: "blocked",
            durationMs: Date.now() - started,
            output: { code: "ALLOCATION_MODEL_NOT_CONFIGURED" },
          };
          context.terminalCode = "ALLOCATION_MODEL_NOT_CONFIGURED";
          upstreamPassed = false;
          await recordStage(mutationClient, begun, 2, "allocation_arithmetic", allocationStage);
          proposal = undefined;
        } else {
          source = "groq";
          const proposed = await withWallTimeout(
            proposeAllocation(
              new GroqClient({ apiKey, model: DEFAULT_GROQ_MODEL, timeoutMs: MODEL_TIMEOUT_MS }),
              {
                receipt: input.receipt,
                participants: participants.map((participant) => ({ id: participant.id, name: participant.display_name })),
                payerId: input.payerParticipantId,
                instruction: input.instruction,
              },
            ),
            MODEL_WALL_TIMEOUT_MS,
          );
          proposal = proposed.proposal;
          context.modelProvider = "groq";
          context.modelName = proposed.model;
          context.modelUsage = proposed.usage;
          context.modelAttempts = proposed.attempts;
        }
      }

      if (proposal) {
        const allowedParticipants = new Set(participants.map((participant) => participant.id));
        const unknownIds = proposal.allocations
          .flatMap((allocation) => allocation.participants)
          .filter((id) => !allowedParticipants.has(id));
        if (unknownIds.length > 0) throw new Error("MODEL_REFERENCED_UNKNOWN_PARTICIPANT");
        const normalizedProposal = { ...proposal, payerId: input.payerParticipantId };
        const reconciled = reconcileAllocation(input.receipt, normalizedProposal);
        if (!reconciled.ok || !reconciled.shares) {
          allocationStage = {
            status: "blocked",
            durationMs: Date.now() - started,
            output: {
              code: "ALLOCATION_RECONCILER_REJECTED",
              issueCodes: reconciled.issues.map((issue) => issue.code),
              conservation: false,
            },
            provider: context.modelProvider ?? undefined,
            model: context.modelName ?? undefined,
            usage: context.modelUsage,
          };
          context.terminalCode = "ALLOCATION_RECONCILER_REJECTED";
          upstreamPassed = false;
        } else {
          context.proposal = normalizedProposal;
          context.shares = reconciled.shares;
          context.debts = sharesToDebts(reconciled.shares, input.payerParticipantId);
          context.allocationId = await persistAllocation(
            client,
            input.tabId,
            input.instruction,
            normalizedProposal,
            reconciled.shares,
          );
          context.balanceSheet = buildBalanceSheet(
            participants,
            reconciled.shares,
            input.payerParticipantId,
            reconciled.totalMinor,
          );
          allocationStage = {
            status: "passed",
            durationMs: Date.now() - started,
            output: {
              allocationId: context.allocationId,
              source,
              conservation: [...reconciled.shares.values()].reduce((sum, value) => sum + value, 0n) === reconciled.totalMinor,
              totalMinor: reconciled.totalMinor.toString(),
              participantCount: reconciled.shares.size,
              modelAttempts: context.modelAttempts,
            },
            provider: context.modelProvider ?? undefined,
            model: context.modelName ?? undefined,
            usage: context.modelUsage,
          };
        }
        await recordStage(mutationClient, begun, 2, "allocation_arithmetic", allocationStage);
      }
    } catch (error) {
      allocationStage = {
        status: "failed",
        durationMs: Date.now() - started,
        output: { code: "ALLOCATION_STAGE_FAILED", message: safeMessage(error), conservation: false },
        provider: context.modelProvider ?? undefined,
        model: context.modelName ?? undefined,
        usage: context.modelUsage,
      };
      context.terminalCode = safeMessage(error).startsWith("MODEL_TIMEOUT")
        ? "ALLOCATION_MODEL_TIMEOUT"
        : "ALLOCATION_STAGE_FAILED";
      upstreamPassed = false;
      await recordStage(mutationClient, begun, 2, "allocation_arithmetic", allocationStage);
    }
  }
  if (allocationStage.status === "skipped") {
    await recordStage(mutationClient, begun, 2, "allocation_arithmetic", allocationStage);
  }

  // 3. Consent/risk agent: no model. It proves adapter, currency, address and
  // debit/payout conservation invariants before anyone is asked to sign.
  started = Date.now();
  let consentStage: StageRecord;
  if (!upstreamPassed || !context.shares) {
    consentStage = {
      status: "skipped",
      durationMs: 0,
      output: { code: "UPSTREAM_STAGE_NOT_PASSED", reason: "Allocation did not pass deterministic reconciliation." },
    };
  } else {
    const activeIds = new Set(context.shares.keys());
    const active = participants.filter((participant) => activeIds.has(participant.id));
    const missingWallets = active.filter((participant) => !ADDRESS_RE.test(participant.wallet_address ?? ""));
    const addresses = active
      .map((participant) => participant.wallet_address?.toLowerCase())
      .filter((address): address is string => Boolean(address));
    const duplicateWallets = new Set(addresses).size !== addresses.length;
    const netted = nettedTransfers(context.debts);
    const walletByParticipant = new Map(
      active.flatMap((participant) => ADDRESS_RE.test(participant.wallet_address ?? "")
        ? [[participant.id, participant.wallet_address!.toLowerCase() as `0x${string}`] as const]
        : []),
    );
    const addressTransfers = netted.flatMap((transfer) => {
      const from = walletByParticipant.get(transfer.debtor);
      const to = walletByParticipant.get(transfer.creditor);
      return from && to ? [{ from, to, value: transfer.amount }] : [];
    });
    const aggregate = aggregateSettlementTransfers(addressTransfers);
    const debitTotal = aggregate.debits.reduce((sum, debit) => sum + debit.value, 0n);
    const payoutTotal = aggregate.payouts.reduce((sum, payout) => sum + payout.value, 0n);
    const contractConfigured = ADDRESS_RE.test(process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT ?? "");
    const risks = [
      !isSettlementCurrency(input.receipt.currency) && "UNSUPPORTED_SETTLEMENT_CURRENCY",
      missingWallets.length > 0 && "PARTICIPANT_WALLET_MISSING",
      duplicateWallets && "DUPLICATE_PARTICIPANT_WALLET",
      !contractConfigured && "V2_CONTRACT_NOT_CONFIGURED",
      debitTotal !== payoutTotal && "DEBIT_PAYOUT_MISMATCH",
    ].filter((risk): risk is string => Boolean(risk));
    consentStage = {
      status: risks.length === 0 ? "passed" : "blocked",
      durationMs: Date.now() - started,
      output: {
        chainAdapter: "base-sepolia",
        chainId: BASE_SEPOLIA_CHAIN_ID,
        currency: input.receipt.currency,
        missingWalletCount: missingWallets.length,
        duplicateWallets,
        contractConfigured,
        transferCount: netted.length,
        debitMinor: debitTotal.toString(),
        payoutMinor: payoutTotal.toString(),
        debitsEqualPayouts: debitTotal === payoutTotal,
        risks,
      },
    };
    if (risks.length > 0) {
      context.terminalCode = risks[0]!;
      upstreamPassed = false;
    }
  }
  await recordStage(mutationClient, begun, 3, "consent_risk", consentStage);

  // 4. Proof verifier: this pre-signature run has no exact settlement binding.
  // submission it is explicitly skipped, leaving the run ready—not verified.
  const proof: StageRecord = {
    status: "skipped",
    durationMs: 0,
    output: {
      code: upstreamPassed ? "SETTLEMENT_NOT_SUBMITTED" : "UPSTREAM_STAGE_NOT_PASSED",
      proofState: "not_submitted",
      independentVerified: false,
      exactBindingRequired: true,
    },
  };
  await recordStage(mutationClient, begun, 4, "proof_verification", proof);

  const terminalStatus: SettlementAgentRunStatus =
    [extractionStage, allocationStage, consentStage, proof].some((stage) => stage.status === "failed")
      ? "failed"
      : [extractionStage, allocationStage, consentStage, proof].some((stage) => stage.status === "blocked")
        ? "blocked"
        : proof.status === "passed"
          ? "verified"
          : "ready";
  const resultSummary = {
    receiptId: context.receiptId,
    allocationId: context.allocationId,
    merchant: input.receipt.merchant,
    currency: input.receipt.currency,
    totalMinor: parseFiat(input.receipt.total).toString(),
    participantCount: participantSnapshot.length,
    payerParticipantId: input.payerParticipantId,
    chainAdapter: "base-sepolia",
    maxStages: 4,
    invariants: {
      receiptArithmetic: extractionStage.status === "passed",
      allocationConservation: allocationStage.status === "passed",
      consentRisk: consentStage.status === "passed",
      independentProof: proof.status === "passed",
    },
    balanceSheet: context.balanceSheet,
    proof: proof.output,
    model: {
      provider: context.modelProvider,
      name: context.modelName,
      usage: context.modelUsage,
      costMicrousd: null,
      attempts: context.modelAttempts,
    },
  };
  const finishAttestedAt = new Date().toISOString();
  const finishAttestation = signAttestation(terminalRunAttestationPayload({
    runId: begun.id,
    ownerId: userId,
    tabId: input.tabId,
    inputHash: runHash,
    status: terminalStatus,
    stageCount: 4,
    resultSummary,
    terminalCode: context.terminalCode,
    modelProvider: context.modelProvider,
    modelName: context.modelName,
    modelUsage: context.modelUsage,
    modelCostMicrousd: null,
    attestedAt: finishAttestedAt,
  }));
  const finishResult = await mutationClient.rpc("finish_settlement_agent_run", {
    target_run: begun.id,
    expected_owner: userId,
    requested_terminal_status: terminalStatus,
    terminal_result: resultSummary,
    requested_terminal_code: context.terminalCode,
    server_attested_at: finishAttestedAt,
    server_attestation: finishAttestation,
  });
  if (finishResult.error) throw new Error(`AGENT_RUN_FINISH_FAILED: ${finishResult.error.message}`);

  const terminalRun = await getSettlementAgentRun(client, begun.id);
  if (!terminalRun) throw new Error("AGENT_RUN_READ_AFTER_COMMIT_FAILED");
  await ensureTerminalRunMemory(client, mutationClient, userId, terminalRun);
  const completed = await getSettlementAgentRun(client, begun.id);
  if (!completed) throw new Error("AGENT_RUN_READ_AFTER_COMMIT_FAILED");
  return { run: completed, deduped: false };
}

export const agentControlInternals = {
  activeRunAttestationPayload,
  BoundedAllocationProposalSchema,
  BoundedReceiptSchema,
  buildBalanceSheet,
  canonicalJson,
  digest,
  eventAttestationPayload,
  eventRowIsAttested,
  mapAgentEvent,
  mapAgentMemory,
  memoryAttestationPayload,
  memoryRowIsAttested,
  numericRecord,
  runRowIsAttested,
  shouldReplaceLatestMemory,
  signAttestation,
  terminalMemorySummary,
  terminalRunAttestationPayload,
  walletBackedParticipantSnapshot,
};
