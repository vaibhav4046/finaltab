import "server-only";

import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  V3_NARRATION_MAX_AUDIO_BYTES,
  V3_NARRATION_OPERATION_ID,
  V3_NARRATION_OPERATOR_EXPIRES_AT,
  V3_NARRATION_SCRIPT_SHA256,
  type V3NarrationBinding,
  type V3NarrationGenerationStore,
  type V3NarrationJournalRecord,
} from "@/lib/server/v3NarrationOperator";

const RpcRowSchema = z.object({
  acquired: z.boolean(),
  operation_id: z.literal(V3_NARRATION_OPERATION_ID),
  actor_subject_hash: z.string().regex(/^[0-9a-f]{64}$/u),
  script_sha256: z.literal(V3_NARRATION_SCRIPT_SHA256),
  state: z.enum(["reserved", "completed", "failed"]),
  audio: z.unknown().nullable(),
  audio_sha256: z.string().regex(/^[0-9a-f]{64}$/u).nullable(),
  audio_bytes: z.number().int().min(0).max(V3_NARRATION_MAX_AUDIO_BYTES).nullable(),
  content_type: z.string().max(80).nullable(),
  provider_request_id: z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/u).nullable(),
  failure_code: z.string().regex(/^[a-z0-9_]{1,80}$/u).nullable(),
  provider_http_status: z.number().int().min(100).max(599).nullable(),
  quota_checked_at: z.string().datetime({ offset: true }),
  remaining_included_characters: z.number().int().min(1_320),
  expires_at: z.string().datetime({ offset: true }),
});

export class V3NarrationStoreError extends Error {
  constructor() {
    super("V3_NARRATION_STORE_UNAVAILABLE");
    this.name = "V3NarrationStoreError";
  }
}

function encodeBytea(value: Buffer): string {
  if (value.length < 1 || value.length > V3_NARRATION_MAX_AUDIO_BYTES) throw new V3NarrationStoreError();
  return `\\x${value.toString("hex")}`;
}

function decodeBytea(value: unknown): Buffer | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\\x[0-9a-f]*$/iu.test(value)) throw new V3NarrationStoreError();
  const hex = value.slice(2);
  if (hex.length % 2 !== 0 || hex.length > V3_NARRATION_MAX_AUDIO_BYTES * 2) throw new V3NarrationStoreError();
  return Buffer.from(hex, "hex");
}

function parseRows(data: unknown, allowEmpty: boolean): V3NarrationJournalRecord | null {
  if (!Array.isArray(data) || data.length > 1 || (!allowEmpty && data.length !== 1)) {
    throw new V3NarrationStoreError();
  }
  if (data.length === 0) return null;
  const parsed = RpcRowSchema.safeParse(data[0]);
  if (!parsed.success || Date.parse(parsed.data.expires_at) !== Date.parse(V3_NARRATION_OPERATOR_EXPIRES_AT)) {
    throw new V3NarrationStoreError();
  }
  return {
    acquired: parsed.data.acquired,
    operationId: parsed.data.operation_id,
    actorSubjectHash: parsed.data.actor_subject_hash,
    scriptSha256: parsed.data.script_sha256,
    state: parsed.data.state,
    audio: decodeBytea(parsed.data.audio),
    audioSha256: parsed.data.audio_sha256,
    audioBytes: parsed.data.audio_bytes,
    contentType: parsed.data.content_type,
    providerRequestId: parsed.data.provider_request_id,
    failureCode: parsed.data.failure_code,
    providerHttpStatus: parsed.data.provider_http_status,
    quotaCheckedAt: parsed.data.quota_checked_at,
    remainingIncludedCharacters: parsed.data.remaining_included_characters,
    expiresAt: parsed.data.expires_at,
  };
}

function adminClient() {
  const client = createAdminSupabaseClient();
  if (!client) throw new V3NarrationStoreError();
  return client;
}

async function rpcRow(
  functionName:
    | "read_finaltab_v3_narration_generation"
    | "reserve_finaltab_v3_narration_generation"
    | "complete_finaltab_v3_narration_generation",
  args: Record<string, unknown>,
  allowEmpty: boolean,
): Promise<V3NarrationJournalRecord | null> {
  const { data, error } = await adminClient().rpc(functionName, args);
  if (error) throw new V3NarrationStoreError();
  return parseRows(data, allowEmpty);
}

export function createV3NarrationGenerationStore(): V3NarrationGenerationStore {
  return {
    async read(binding) {
      return rpcRow("read_finaltab_v3_narration_generation", {
        expected_actor_hash: binding.actorSubjectHash,
        expected_script_sha256: binding.scriptSha256,
      }, true);
    },
    async reserve(binding, quotaFacts) {
      if (
        quotaFacts.result !== "approved"
        || quotaFacts.reasonCode !== "included_quota_sufficient"
        || quotaFacts.httpStatus !== 200
        || quotaFacts.remainingIncludedCharacters === null
        || quotaFacts.remainingIncludedCharacters < 1_320
      ) throw new V3NarrationStoreError();
      const record = await rpcRow("reserve_finaltab_v3_narration_generation", {
        expected_actor_hash: binding.actorSubjectHash,
        expected_script_sha256: binding.scriptSha256,
        expected_quota_checked_at: quotaFacts.checkedAt,
        expected_remaining_included_characters: quotaFacts.remainingIncludedCharacters,
      }, false);
      if (!record) throw new V3NarrationStoreError();
      return record;
    },
    async complete(binding, artifact) {
      const record = await rpcRow("complete_finaltab_v3_narration_generation", {
        expected_actor_hash: binding.actorSubjectHash,
        expected_script_sha256: binding.scriptSha256,
        generated_audio: encodeBytea(artifact.audio),
        generated_audio_sha256: artifact.audioSha256,
        generated_audio_bytes: artifact.audio.length,
        safe_provider_request_id: artifact.providerRequestId,
      }, false);
      if (!record) throw new V3NarrationStoreError();
      return record;
    },
    async fail(binding: V3NarrationBinding, failure) {
      const { data, error } = await adminClient().rpc("fail_finaltab_v3_narration_generation", {
        expected_actor_hash: binding.actorSubjectHash,
        expected_script_sha256: binding.scriptSha256,
        safe_failure_code: failure.code,
        safe_provider_http_status: failure.providerHttpStatus,
      });
      if (error || typeof data !== "boolean") throw new V3NarrationStoreError();
    },
  };
}

export const v3NarrationStoreInternals = { encodeBytea, decodeBytea, parseRows };
