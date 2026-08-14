import "server-only";

import { createHash } from "node:crypto";

export const V3_NARRATION_OPERATOR_EXPIRES_AT = "2026-08-12T08:00:00Z";
export const V3_NARRATION_OPERATION_ID = "finaltab-v3-elevenlabs-george-20260812";
export const V3_NARRATION_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const V3_NARRATION_MODEL_ID = "eleven_multilingual_v2";
export const V3_NARRATION_OUTPUT_FORMAT = "mp3_44100_128";
export const V3_NARRATION_SCRIPT_SHA256 = "3361c9d84fa42ddeffd5c4eaf1b5e37b5db0494f9f72b404f2e9e4b550119a11";
export const ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER = 1.1;
export const ELEVENLABS_SUBSCRIPTION_ENDPOINT = "https://api.elevenlabs.io/v1/user/subscription";

export const V3_NARRATION_LINES = [
  "FINALTab. One receipt. One clear settlement.",
  "Turn a shared receipt into an exact split, gather approvals, move test funds once, and leave public proof.",
  "For dinners, trips, team expenses, or agent-led payments, everyone sees each amount, approval, and result.",
  "Vision reads the bill. Math checks every cent. Reviewers check the split and wallet safety. A service runs it. Public test records confirm it.",
  "Watch the product: sign in, create a tab, upload and correct a receipt, add people, assign items, include tax and tip, run four checks, inspect balances and memory, then lock the plan in one clear, traceable workflow.",
  "Now try a hard request: weighted items, shared service, exclusions, and a payer correction. Voice reads it back. The model suggests assignments. Math balances every cent. Four reviewers record what passed and why. Memory keeps a compact audit summary.",
  "MCP, the tool connection, signs in, lists nine tools, allocates the receipt, prepares wallet details, and asks for approval. Then it stops: no signing, no sending, and no money moves. A read-only check verifies the earlier authorized settlement.",
  "FINALTab. People approve. The earlier run executed once. Anyone can verify.",
] as const;

export const V3_NARRATION_TEXT = V3_NARRATION_LINES.join("\n\n");
export const V3_NARRATION_EXACT_CHARACTERS = 1_200;
export const V3_NARRATION_REQUIRED_INCLUDED_CHARACTERS = 1_320;
export const V3_NARRATION_MAX_AUDIO_BYTES = 4_194_304;
export const V3_NARRATION_MIN_AUDIO_BYTES = 10_000;

const calculatedScriptSha256 = sha256(V3_NARRATION_TEXT);
if (
  calculatedScriptSha256 !== V3_NARRATION_SCRIPT_SHA256
  || [...V3_NARRATION_TEXT].length !== V3_NARRATION_EXACT_CHARACTERS
  || Math.ceil(V3_NARRATION_EXACT_CHARACTERS * ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER)
    !== V3_NARRATION_REQUIRED_INCLUDED_CHARACTERS
) {
  throw new Error("The hard-coded V3 narration contract is inconsistent");
}

export type V3NarrationOperatorMode = "preflight" | "generate";
export type V3NarrationJournalState = "reserved" | "completed" | "failed";

export interface V3NarrationJournalRecord {
  acquired: boolean;
  operationId: string;
  actorSubjectHash: string;
  scriptSha256: string;
  state: V3NarrationJournalState;
  audio: Buffer | null;
  audioSha256: string | null;
  audioBytes: number | null;
  contentType: string | null;
  providerRequestId: string | null;
  failureCode: string | null;
  providerHttpStatus: number | null;
  quotaCheckedAt: string;
  remainingIncludedCharacters: number;
  expiresAt: string;
}

export interface V3NarrationGenerationStore {
  read(binding: V3NarrationBinding): Promise<V3NarrationJournalRecord | null>;
  reserve(binding: V3NarrationBinding, quotaFacts: ElevenLabsSafeQuotaFacts): Promise<V3NarrationJournalRecord>;
  complete(
    binding: V3NarrationBinding,
    artifact: { audio: Buffer; audioSha256: string; providerRequestId: string | null },
  ): Promise<V3NarrationJournalRecord>;
  fail(
    binding: V3NarrationBinding,
    failure: { code: string; providerHttpStatus: number | null },
  ): Promise<void>;
}

export interface V3NarrationBinding {
  actorSubjectHash: string;
  scriptSha256: string;
}

export interface ElevenLabsSafeQuotaFacts {
  sanitized: true;
  result: "approved" | "denied";
  reasonCode: string;
  httpStatus: number | null;
  exactNarrationCharacters: number;
  safetyMultiplier: number;
  requiredIncludedCharacters: number;
  remainingIncludedCharacters: number | null;
  subscriptionActive: boolean | null;
  currentOverageIsZero: boolean | null;
  hasOpenInvoices: boolean | null;
  paymentPendingOrFailed: boolean | null;
  extensionOrOverageAvailable: boolean | null;
  checkedAt: string;
}

export type V3NarrationOperatorResult =
  | { ok: true; kind: "preflight"; facts: ElevenLabsSafeQuotaFacts }
  | {
      ok: true;
      kind: "audio";
      audio: Buffer;
      audioSha256: string;
      providerRequestId: string | null;
      replayed: boolean;
      quotaFacts: ElevenLabsSafeQuotaFacts | null;
    }
  | {
      ok: false;
      status: 409 | 410 | 412 | 502 | 503;
      code: string;
      facts?: ElevenLabsSafeQuotaFacts;
    };

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function classifyNonNegativeDecimal(value: unknown): "zero" | "nonzero" | "malformed" {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return "malformed";
    return value === 0 ? "zero" : "nonzero";
  }
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return "malformed";
  return /^0(?:\.0+)?$/u.test(value) ? "zero" : "nonzero";
}

function baseQuotaFacts(checkedAt: string): ElevenLabsSafeQuotaFacts {
  return {
    sanitized: true,
    result: "denied",
    reasonCode: "subscription_response_malformed",
    httpStatus: null,
    exactNarrationCharacters: V3_NARRATION_EXACT_CHARACTERS,
    safetyMultiplier: ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER,
    requiredIncludedCharacters: V3_NARRATION_REQUIRED_INCLUDED_CHARACTERS,
    remainingIncludedCharacters: null,
    subscriptionActive: null,
    currentOverageIsZero: null,
    hasOpenInvoices: null,
    paymentPendingOrFailed: null,
    extensionOrOverageAvailable: null,
    checkedAt,
  };
}

function deniedQuota(
  facts: ElevenLabsSafeQuotaFacts,
  reasonCode: string,
): { allowed: false; facts: ElevenLabsSafeQuotaFacts } {
  return { allowed: false, facts: { ...facts, result: "denied", reasonCode } };
}

export function assessElevenLabsV3Subscription(subscription: unknown, checkedAt = new Date().toISOString()): {
  allowed: boolean;
  facts: ElevenLabsSafeQuotaFacts;
} {
  const facts = baseQuotaFacts(checkedAt);
  if (!isRecord(subscription)) return deniedQuota(facts, "subscription_response_malformed");

  const characterCount = subscription.character_count;
  const characterLimit = subscription.character_limit;
  const status = subscription.status;
  const currentOverage = subscription.current_overage;
  const hasOpenInvoices = subscription.has_open_invoices;
  const openInvoices = subscription.open_invoices;
  const nextInvoice = subscription.next_invoice;
  const canExtendCharacterLimit = subscription.can_extend_character_limit;
  const maxCreditLimitExtension = subscription.max_credit_limit_extension;

  const extensionLimitIsValid = isNonNegativeSafeInteger(maxCreditLimitExtension)
    || maxCreditLimitExtension === "unlimited";
  const overageClassification = isRecord(currentOverage)
    ? classifyNonNegativeDecimal(currentOverage.amount)
    : "malformed";
  const nextPaymentIntentStatus = isRecord(nextInvoice) ? nextInvoice.payment_intent_status : null;
  const openInvoicesIsValid = openInvoices === undefined || Array.isArray(openInvoices);
  const canExtendIsValid = typeof canExtendCharacterLimit === "boolean";
  const nextInvoiceIsValid = nextInvoice === undefined || nextInvoice === null || isRecord(nextInvoice);
  const paymentIntentIsValid = nextPaymentIntentStatus === undefined
    || nextPaymentIntentStatus === null
    || typeof nextPaymentIntentStatus === "string";

  if (
    !isNonNegativeSafeInteger(characterCount)
    || !isNonNegativeSafeInteger(characterLimit)
    || typeof status !== "string"
    || typeof hasOpenInvoices !== "boolean"
    || !openInvoicesIsValid
    || !canExtendIsValid
    || !extensionLimitIsValid
    || overageClassification === "malformed"
    || !nextInvoiceIsValid
    || !paymentIntentIsValid
  ) {
    return deniedQuota(facts, "subscription_response_malformed");
  }

  const invoiceIssue = hasOpenInvoices || (Array.isArray(openInvoices) && openInvoices.length > 0);
  const paymentPendingOrFailed = typeof nextPaymentIntentStatus === "string"
    && !["paid", "succeeded"].includes(nextPaymentIntentStatus.toLocaleLowerCase("en-US"));
  const extensionOrOverageAvailable = canExtendCharacterLimit !== false
    || maxCreditLimitExtension === "unlimited"
    || maxCreditLimitExtension !== 0;
  const assessed: ElevenLabsSafeQuotaFacts = {
    ...facts,
    remainingIncludedCharacters: Math.max(0, characterLimit - characterCount),
    subscriptionActive: status === "active",
    currentOverageIsZero: overageClassification === "zero",
    hasOpenInvoices: invoiceIssue,
    paymentPendingOrFailed,
    extensionOrOverageAvailable,
  };

  if (status !== "active") return deniedQuota(assessed, "subscription_not_active_or_payment_pending");
  if (invoiceIssue || paymentPendingOrFailed) return deniedQuota(assessed, "open_invoice_or_payment_pending");
  if (overageClassification !== "zero") return deniedQuota(assessed, "current_overage_nonzero");
  // Even when the current usage is below the included limit, an enabled
  // extension/overage rail could turn a GET-to-POST race into a charge. This
  // one-shot operator therefore runs only when the account cannot extend.
  if (extensionOrOverageAvailable) return deniedQuota(assessed, "extension_or_overage_enabled");
  if (assessed.remainingIncludedCharacters! < V3_NARRATION_REQUIRED_INCLUDED_CHARACTERS) {
    return deniedQuota(assessed, "insufficient_included_quota");
  }
  return {
    allowed: true,
    facts: { ...assessed, result: "approved", reasonCode: "included_quota_sufficient" },
  };
}

async function getElevenLabsV3Quota(
  fetchImpl: typeof fetch,
  apiKey: string,
  checkedAt: string,
): Promise<{ allowed: boolean; facts: ElevenLabsSafeQuotaFacts }> {
  const facts = baseQuotaFacts(checkedAt);
  let response: Response;
  try {
    response = await fetchImpl(ELEVENLABS_SUBSCRIPTION_ENDPOINT, {
      method: "GET",
      redirect: "error",
      headers: { accept: "application/json", "xi-api-key": apiKey },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch {
    return deniedQuota(facts, "subscription_get_failed");
  }
  if (!response.ok) {
    return deniedQuota(
      { ...facts, httpStatus: Number.isInteger(response.status) ? response.status : null },
      "subscription_get_http_error",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return deniedQuota({ ...facts, httpStatus: response.status }, "subscription_response_malformed");
  }
  const assessed = assessElevenLabsV3Subscription(body, checkedAt);
  return { ...assessed, facts: { ...assessed.facts, httpStatus: response.status } };
}

function journalRecordMatchesBinding(
  record: V3NarrationJournalRecord,
  binding: V3NarrationBinding,
): boolean {
  return record.operationId === V3_NARRATION_OPERATION_ID
    && record.actorSubjectHash === binding.actorSubjectHash
    && record.scriptSha256 === binding.scriptSha256
    && Number.isFinite(Date.parse(record.expiresAt))
    && Date.parse(record.expiresAt) === Date.parse(V3_NARRATION_OPERATOR_EXPIRES_AT);
}

function validateStoredArtifact(
  record: V3NarrationJournalRecord,
  binding: V3NarrationBinding,
): V3NarrationOperatorResult {
  if (
    !journalRecordMatchesBinding(record, binding)
    || record.state !== "completed"
    || !record.audio
    || record.audio.length < V3_NARRATION_MIN_AUDIO_BYTES
    || record.audio.length > V3_NARRATION_MAX_AUDIO_BYTES
    || record.audioBytes !== record.audio.length
    || record.audioSha256 !== sha256(record.audio)
    || record.contentType !== "audio/mpeg"
  ) {
    return { ok: false, status: 503, code: "STORED_ARTIFACT_INVALID" };
  }
  return {
    ok: true,
    kind: "audio",
    audio: record.audio,
    audioSha256: record.audioSha256,
    providerRequestId: record.providerRequestId,
    replayed: true,
    quotaFacts: {
      ...baseQuotaFacts(record.quotaCheckedAt),
      result: "approved",
      reasonCode: "included_quota_sufficient",
      httpStatus: 200,
      remainingIncludedCharacters: record.remainingIncludedCharacters,
      subscriptionActive: true,
      currentOverageIsZero: true,
      hasOpenInvoices: false,
      paymentPendingOrFailed: false,
      extensionOrOverageAvailable: false,
    },
  };
}

function existingRecordResult(
  record: V3NarrationJournalRecord,
  binding: V3NarrationBinding,
): V3NarrationOperatorResult {
  if (!journalRecordMatchesBinding(record, binding)) {
    return { ok: false, status: 503, code: "GENERATION_JOURNAL_BINDING_INVALID" };
  }
  if (record.state === "completed") return validateStoredArtifact(record, binding);
  if (record.state === "reserved") {
    return { ok: false, status: 409, code: "GENERATION_ALREADY_RESERVED" };
  }
  return { ok: false, status: 409, code: "GENERATION_PREVIOUS_ATTEMPT_FAILED" };
}

async function readBoundedAudio(response: Response): Promise<Buffer> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < V3_NARRATION_MIN_AUDIO_BYTES || parsed > V3_NARRATION_MAX_AUDIO_BYTES) {
      throw new Error("invalid provider audio length");
    }
  }
  if (!response.body) throw new Error("provider audio body missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > V3_NARRATION_MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw new Error("provider audio exceeds bound");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total < V3_NARRATION_MIN_AUDIO_BYTES) throw new Error("provider audio is implausibly small");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function safeProviderRequestId(response: Response): string | null {
  const candidate = response.headers.get("request-id") ?? response.headers.get("x-request-id");
  return candidate && /^[A-Za-z0-9._:-]{1,200}$/u.test(candidate) ? candidate : null;
}

async function bestEffortFailure(
  store: V3NarrationGenerationStore,
  binding: V3NarrationBinding,
  code: string,
  providerHttpStatus: number | null,
): Promise<void> {
  try {
    await store.fail(binding, { code, providerHttpStatus });
  } catch {
    // The reservation itself remains the fail-closed replay guard even if the
    // terminal diagnostic cannot be persisted.
  }
}

export async function runV3NarrationOperator({
  mode,
  actorSubject,
  apiKey,
  store,
  fetchImpl = globalThis.fetch,
  nowMs = Date.now(),
}: {
  mode: V3NarrationOperatorMode;
  actorSubject: string;
  apiKey: string;
  store: V3NarrationGenerationStore;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<V3NarrationOperatorResult> {
  if (!Number.isFinite(nowMs) || nowMs >= Date.parse(V3_NARRATION_OPERATOR_EXPIRES_AT)) {
    return { ok: false, status: 410, code: "OPERATOR_EXPIRED" };
  }
  if (typeof actorSubject !== "string" || actorSubject.length < 1 || actorSubject.length > 512) {
    return { ok: false, status: 503, code: "OPERATOR_BINDING_INVALID" };
  }
  if (typeof apiKey !== "string" || apiKey.trim().length < 1 || typeof fetchImpl !== "function") {
    return { ok: false, status: 503, code: "OPERATOR_NOT_CONFIGURED" };
  }

  const binding: V3NarrationBinding = {
    actorSubjectHash: sha256(actorSubject),
    scriptSha256: V3_NARRATION_SCRIPT_SHA256,
  };
  const checkedAt = new Date(nowMs).toISOString();

  if (mode === "preflight") {
    const preflight = await getElevenLabsV3Quota(fetchImpl, apiKey, checkedAt);
    return preflight.allowed
      ? { ok: true, kind: "preflight", facts: preflight.facts }
      : { ok: false, status: 412, code: "QUOTA_PREFLIGHT_DENIED", facts: preflight.facts };
  }

  let existing: V3NarrationJournalRecord | null;
  try {
    existing = await store.read(binding);
  } catch {
    return { ok: false, status: 503, code: "GENERATION_JOURNAL_UNAVAILABLE" };
  }
  if (existing) return existingRecordResult(existing, binding);

  const preflight = await getElevenLabsV3Quota(fetchImpl, apiKey, checkedAt);
  if (!preflight.allowed) {
    return { ok: false, status: 412, code: "QUOTA_PREFLIGHT_DENIED", facts: preflight.facts };
  }

  let reservation: V3NarrationJournalRecord;
  try {
    reservation = await store.reserve(binding, preflight.facts);
  } catch {
    return { ok: false, status: 503, code: "GENERATION_JOURNAL_UNAVAILABLE" };
  }
  if (!reservation.acquired) return existingRecordResult(reservation, binding);
  if (!journalRecordMatchesBinding(reservation, binding) || reservation.state !== "reserved") {
    return { ok: false, status: 503, code: "GENERATION_RESERVATION_INVALID" };
  }

  const endpoint = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(V3_NARRATION_VOICE_ID)}`);
  endpoint.searchParams.set("output_format", V3_NARRATION_OUTPUT_FORMAT);
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "audio/mpeg",
        "content-type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({ text: V3_NARRATION_TEXT, model_id: V3_NARRATION_MODEL_ID }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
  } catch {
    await bestEffortFailure(store, binding, "synthesis_transport_failed", null);
    return { ok: false, status: 502, code: "SYNTHESIS_FAILED_CLOSED" };
  }

  if (!response.ok) {
    const safeStatus = response.status >= 400 && response.status <= 599 ? response.status : null;
    await bestEffortFailure(store, binding, "synthesis_http_error", safeStatus);
    return { ok: false, status: 502, code: "SYNTHESIS_FAILED_CLOSED" };
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
  if (contentType !== "audio/mpeg" && contentType !== "audio/mp3" && contentType !== "application/octet-stream") {
    await bestEffortFailure(store, binding, "synthesis_invalid_content_type", null);
    return { ok: false, status: 502, code: "SYNTHESIS_FAILED_CLOSED" };
  }

  let audio: Buffer;
  try {
    audio = await readBoundedAudio(response);
  } catch {
    await bestEffortFailure(store, binding, "synthesis_invalid_audio", null);
    return { ok: false, status: 502, code: "SYNTHESIS_FAILED_CLOSED" };
  }

  const audioSha256 = sha256(audio);
  const providerRequestId = safeProviderRequestId(response);
  let completed: V3NarrationJournalRecord;
  try {
    completed = await store.complete(binding, { audio, audioSha256, providerRequestId });
  } catch {
    return { ok: false, status: 503, code: "ARTIFACT_STORE_UNAVAILABLE" };
  }
  const verified = validateStoredArtifact(completed, binding);
  if (!verified.ok || verified.kind !== "audio") return verified;
  return {
    ...verified,
    replayed: false,
    quotaFacts: preflight.facts,
  };
}
