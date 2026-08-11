import "server-only";

import { z } from "zod";
import type { ApiPrincipal } from "@/lib/server/apiAccess";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { VOICE_STT_RESERVATION_SECONDS } from "@/lib/voicePolicy";

export { VOICE_STT_RESERVATION_SECONDS } from "@/lib/voicePolicy";

export type VoiceQuotaCapability = "transcription" | "readback";

export type VoiceBudgetReason =
  | "reserved"
  | "minute_limit"
  | "user_daily_budget"
  | "user_monthly_budget"
  | "project_daily_budget"
  | "project_monthly_budget"
  | "user_concurrency"
  | "project_concurrency";

const VoiceQuotaRowSchema = z.object({
  allowed: z.boolean(),
  reason: z.enum([
    "reserved",
    "minute_limit",
    "user_daily_budget",
    "user_monthly_budget",
    "project_daily_budget",
    "project_monthly_budget",
    "user_concurrency",
    "project_concurrency",
  ]),
  remaining: z.number().int().min(0).max(20),
  resets_at: z.string().datetime({ offset: true }),
  retry_at: z.string().datetime({ offset: true }),
  reservation_id: z.string().uuid().nullable(),
  reserved_units: z.number().int().min(0).max(600),
  unit: z.enum(["seconds", "characters"]),
  user_daily_remaining: z.number().int().min(0).max(60_000),
  user_monthly_remaining: z.number().int().min(0).max(60_000),
  project_daily_remaining: z.number().int().min(0).max(60_000),
  project_monthly_remaining: z.number().int().min(0).max(60_000),
  concurrency_remaining: z.number().int().min(0).max(4).nullable(),
  daily_resets_at: z.string().datetime({ offset: true }),
  monthly_resets_at: z.string().datetime({ offset: true }),
}).superRefine((row, context) => {
  const allowedShape = row.reason === "reserved" && row.reservation_id !== null && row.reserved_units > 0;
  const deniedShape = row.reason !== "reserved" && row.reservation_id === null && row.reserved_units === 0;
  if (row.allowed ? !allowedShape : !deniedShape) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "inconsistent voice reservation decision" });
  }
  if (row.unit === "seconds") {
    if ((row.allowed && row.reserved_units !== VOICE_STT_RESERVATION_SECONDS) || row.concurrency_remaining === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid transcription reservation" });
    }
  } else if (row.concurrency_remaining !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "readback cannot carry a streaming lease" });
  }
});

export interface VoiceQuotaDecision {
  allowed: boolean;
  reason: VoiceBudgetReason;
  remaining: number;
  resetsAt: string;
  retryAt: string;
  reservationId: string | null;
  reservedUnits: number;
  unit: "seconds" | "characters";
  userDailyRemaining: number;
  userMonthlyRemaining: number;
  projectDailyRemaining: number;
  projectMonthlyRemaining: number;
  concurrencyRemaining: number | null;
  dailyResetsAt: string;
  monthlyResetsAt: string;
  durable: boolean;
}

export class VoiceQuotaError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "SESSION_REQUIRED" | "STORE_UNAVAILABLE" | "INVALID_RESPONSE",
    readonly httpStatus: 403 | 503,
  ) {
    super(code);
    this.name = "VoiceQuotaError";
  }
}

export function parseVoiceQuotaRpcData(data: unknown): VoiceQuotaDecision {
  if (Array.isArray(data) && data.length !== 1) {
    throw new VoiceQuotaError("INVALID_RESPONSE", 503);
  }
  const candidate = Array.isArray(data) ? data[0] : data;
  const parsed = VoiceQuotaRowSchema.safeParse(candidate);
  if (!parsed.success) throw new VoiceQuotaError("INVALID_RESPONSE", 503);
  return {
    allowed: parsed.data.allowed,
    reason: parsed.data.reason,
    remaining: parsed.data.remaining,
    resetsAt: parsed.data.resets_at,
    retryAt: parsed.data.retry_at,
    reservationId: parsed.data.reservation_id,
    reservedUnits: parsed.data.reserved_units,
    unit: parsed.data.unit,
    userDailyRemaining: parsed.data.user_daily_remaining,
    userMonthlyRemaining: parsed.data.user_monthly_remaining,
    projectDailyRemaining: parsed.data.project_daily_remaining,
    projectMonthlyRemaining: parsed.data.project_monthly_remaining,
    concurrencyRemaining: parsed.data.concurrency_remaining,
    dailyResetsAt: parsed.data.daily_resets_at,
    monthlyResetsAt: parsed.data.monthly_resets_at,
    durable: true,
  };
}

export function voiceQuotaRetryAfterSeconds(retryAt: string, nowMs = Date.now()): number {
  const resetMs = Date.parse(retryAt);
  if (!Number.isFinite(resetMs)) return 60;
  // Calendar-month budget resets can be more than 30 days away. Bound the
  // public hint without misrepresenting daily/monthly denials as one minute.
  return Math.max(1, Math.min(2_678_400, Math.ceil((resetMs - nowMs) / 1_000)));
}

function quotaClient(principal: ApiPrincipal) {
  // Paid voice is tied to a verified Supabase identity. Hashed machine tokens
  // cannot reserve provider spend, and malformed/non-user subjects fail closed.
  if (principal.source !== "session" && principal.source !== "bearer-jwt") {
    throw new VoiceQuotaError("SESSION_REQUIRED", 403);
  }
  const userId = z.string().uuid().safeParse(principal.subject);
  if (!userId.success) throw new VoiceQuotaError("SESSION_REQUIRED", 403);

  // The reservation RPC is service-role-only so an authenticated browser cannot
  // burn the shared provider budget without passing through this verified route.
  const client = createAdminSupabaseClient();
  if (!client) throw new VoiceQuotaError("NOT_CONFIGURED", 503);
  return { client, userId: userId.data };
}

export async function reserveDurableVoiceBudget(
  principal: ApiPrincipal,
  capability: VoiceQuotaCapability,
  units: number,
): Promise<VoiceQuotaDecision> {
  if (process.env.FINALTAB_VOICE_DURABLE_QUOTA !== "supabase") {
    throw new VoiceQuotaError("NOT_CONFIGURED", 503);
  }
  if (!Number.isSafeInteger(units) || units < 1 || units > 600) {
    throw new VoiceQuotaError("INVALID_RESPONSE", 503);
  }
  if (capability === "transcription" && units !== VOICE_STT_RESERVATION_SECONDS) {
    throw new VoiceQuotaError("INVALID_RESPONSE", 503);
  }
  const { client, userId } = quotaClient(principal);
  const { data, error } = await client.rpc("reserve_voice_budget", {
    expected_user: userId,
    requested_capability: capability,
    requested_units: units,
  });
  if (error) throw new VoiceQuotaError("STORE_UNAVAILABLE", 503);
  return parseVoiceQuotaRpcData(data);
}

export function withVoiceQuotaHeaders(response: Response, decision: VoiceQuotaDecision): Response {
  response.headers.set("x-voice-ratelimit-remaining", String(decision.remaining));
  response.headers.set("x-voice-ratelimit-reset", decision.resetsAt);
  response.headers.set("x-voice-ratelimit-durable", String(decision.durable));
  response.headers.set("x-voice-budget-durable", String(decision.durable));
  response.headers.set("x-voice-budget-unit", decision.unit);
  response.headers.set("x-voice-budget-reserved-units", String(decision.reservedUnits));
  response.headers.set("x-voice-budget-user-day-remaining", String(decision.userDailyRemaining));
  response.headers.set("x-voice-budget-user-month-remaining", String(decision.userMonthlyRemaining));
  response.headers.set("x-voice-budget-day-reset", decision.dailyResetsAt);
  response.headers.set("x-voice-budget-month-reset", decision.monthlyResetsAt);
  if (decision.concurrencyRemaining !== null) {
    response.headers.set("x-voice-concurrency-remaining", String(decision.concurrencyRemaining));
  }
  return response;
}
