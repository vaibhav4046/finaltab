export const ELEVENLABS_SUBSCRIPTION_ENDPOINT = "https://api.elevenlabs.io/v1/user/subscription";
export const ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER = 1.1;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function classifyNonNegativeDecimal(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return "malformed";
    return value === 0 ? "zero" : "nonzero";
  }
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return "malformed";
  return /^0(?:\.0+)?$/u.test(value) ? "zero" : "nonzero";
}

function quotaFacts(exactNarrationCharacters, safetyMultiplier) {
  return {
    sanitized: true,
    result: "denied",
    reasonCode: "subscription_response_malformed",
    httpStatus: null,
    exactNarrationCharacters,
    safetyMultiplier,
    requiredIncludedCharacters: Math.ceil(exactNarrationCharacters * safetyMultiplier),
    remainingIncludedCharacters: null,
    subscriptionActive: null,
    currentOverageIsZero: null,
    hasOpenInvoices: null,
    paymentPendingOrFailed: null,
    extensionOrOverageAvailable: null,
  };
}

function denied(facts, reasonCode) {
  return {
    allowed: false,
    facts: { ...facts, result: "denied", reasonCode },
  };
}

export function countElevenLabsNarrationCharacters(narration) {
  if (typeof narration !== "string" || narration.length === 0) {
    throw new Error("The exact non-empty narration text is required for quota preflight");
  }
  return [...narration].length;
}

export function assessElevenLabsSubscription(
  subscription,
  {
    exactNarrationCharacters,
    safetyMultiplier = ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER,
  } = {},
) {
  if (!Number.isSafeInteger(exactNarrationCharacters) || exactNarrationCharacters <= 0) {
    throw new Error("exactNarrationCharacters must be a positive safe integer");
  }
  if (!Number.isFinite(safetyMultiplier) || safetyMultiplier < 1) {
    throw new Error("The included-quota safety multiplier must be at least 1");
  }

  const facts = quotaFacts(exactNarrationCharacters, safetyMultiplier);
  if (!isRecord(subscription)) return denied(facts, "subscription_response_malformed");

  const {
    character_count: characterCount,
    character_limit: characterLimit,
    status,
    current_overage: currentOverage,
    has_open_invoices: hasOpenInvoices,
    open_invoices: openInvoices,
    next_invoice: nextInvoice,
    can_extend_character_limit: canExtendCharacterLimit,
    max_credit_limit_extension: maxCreditLimitExtension,
  } = subscription;

  const extensionLimitIsValid = isNonNegativeSafeInteger(maxCreditLimitExtension)
    || maxCreditLimitExtension === "unlimited";
  const overageClassification = isRecord(currentOverage)
    ? classifyNonNegativeDecimal(currentOverage.amount)
    : "malformed";
  const nextPaymentIntentStatus = isRecord(nextInvoice) ? nextInvoice.payment_intent_status : null;
  const openInvoicesIsValid = openInvoices === undefined || Array.isArray(openInvoices);
  const canExtendCharacterLimitIsValid = typeof canExtendCharacterLimit === "boolean";
  const nextInvoiceIsValid = nextInvoice === undefined || nextInvoice === null || isRecord(nextInvoice);
  const nextPaymentIntentStatusIsValid = nextPaymentIntentStatus === undefined
    || nextPaymentIntentStatus === null
    || typeof nextPaymentIntentStatus === "string";

  if (
    !isNonNegativeSafeInteger(characterCount)
    || !isNonNegativeSafeInteger(characterLimit)
    || typeof status !== "string"
    || typeof hasOpenInvoices !== "boolean"
    || !openInvoicesIsValid
    || !canExtendCharacterLimitIsValid
    || !extensionLimitIsValid
    || overageClassification === "malformed"
    || !nextInvoiceIsValid
    || !nextPaymentIntentStatusIsValid
  ) {
    return denied(facts, "subscription_response_malformed");
  }

  const remainingIncludedCharacters = Math.max(0, characterLimit - characterCount);
  const invoiceIssue = hasOpenInvoices || (Array.isArray(openInvoices) && openInvoices.length > 0);
  const paymentPendingOrFailed = typeof nextPaymentIntentStatus === "string"
    && !["paid", "succeeded"].includes(nextPaymentIntentStatus.toLocaleLowerCase("en-US"));
  const extensionOrOverageAvailable = canExtendCharacterLimit !== false
    || maxCreditLimitExtension === "unlimited"
    || maxCreditLimitExtension !== 0;
  const assessedFacts = {
    ...facts,
    remainingIncludedCharacters,
    subscriptionActive: status === "active",
    currentOverageIsZero: overageClassification === "zero",
    hasOpenInvoices: invoiceIssue,
    paymentPendingOrFailed,
    extensionOrOverageAvailable,
  };

  if (status !== "active") return denied(assessedFacts, "subscription_not_active_or_payment_pending");
  if (invoiceIssue || paymentPendingOrFailed) return denied(assessedFacts, "open_invoice_or_payment_pending");
  if (overageClassification !== "zero") return denied(assessedFacts, "current_overage_nonzero");
  if (extensionOrOverageAvailable) return denied(assessedFacts, "extension_or_overage_enabled");
  if (remainingIncludedCharacters < facts.requiredIncludedCharacters) {
    return denied(assessedFacts, "insufficient_included_quota");
  }

  return {
    allowed: true,
    facts: { ...assessedFacts, result: "approved", reasonCode: "included_quota_sufficient" },
  };
}

export async function getElevenLabsQuotaPreflight({
  fetchImpl = globalThis.fetch,
  apiKey,
  narration,
  safetyMultiplier = ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER,
  endpoint = ELEVENLABS_SUBSCRIPTION_ENDPOINT,
  signal,
}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");
  if (typeof apiKey !== "string" || apiKey.length === 0) throw new Error("ELEVENLABS_API_KEY is required");

  const exactNarrationCharacters = countElevenLabsNarrationCharacters(narration);
  const baseFacts = quotaFacts(exactNarrationCharacters, safetyMultiplier);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      redirect: "error",
      headers: {
        accept: "application/json",
        "xi-api-key": apiKey,
      },
      ...(signal ? { signal } : {}),
    });
  } catch {
    return denied(baseFacts, "subscription_get_failed");
  }

  if (!response || typeof response.ok !== "boolean" || !response.ok) {
    const httpStatus = Number.isInteger(response?.status) ? response.status : null;
    return denied({ ...baseFacts, httpStatus }, "subscription_get_http_error");
  }

  let subscription;
  try {
    subscription = await response.json();
  } catch {
    const httpStatus = Number.isInteger(response.status) ? response.status : null;
    return denied({ ...baseFacts, httpStatus }, "subscription_response_malformed");
  }

  const assessment = assessElevenLabsSubscription(subscription, {
    exactNarrationCharacters,
    safetyMultiplier,
  });
  return {
    ...assessment,
    facts: {
      ...assessment.facts,
      httpStatus: Number.isInteger(response.status) ? response.status : null,
    },
  };
}

export async function runQuotaGuardedElevenLabsSynthesis({
  fetchImpl = globalThis.fetch,
  apiKey,
  narration,
  modelId,
  synthesisEndpoint,
  onPreflight,
  onBeforePost,
  preflightSignal,
  synthesisSignal,
}) {
  const preflight = await getElevenLabsQuotaPreflight({
    fetchImpl,
    apiKey,
    narration,
    signal: preflightSignal,
  });

  if (onPreflight) await onPreflight(preflight.facts);
  if (!preflight.allowed) return { preflight, response: null };
  if (onBeforePost) await onBeforePost();

  const response = await fetchImpl(synthesisEndpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      accept: "audio/mpeg",
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({ text: narration, model_id: modelId }),
    ...(synthesisSignal ? { signal: synthesisSignal } : {}),
  });
  return { preflight, response };
}
