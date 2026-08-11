import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  parseVoiceQuotaRpcData,
  reserveDurableVoiceBudget,
  VOICE_STT_RESERVATION_SECONDS,
  VoiceQuotaError,
  voiceQuotaRetryAfterSeconds,
  withVoiceQuotaHeaders,
} from "@/lib/server/voiceQuota";
import type { ApiPrincipal } from "@/lib/server/apiAccess";

const allowedRpcRow = {
  allowed: true,
  reason: "reserved",
  remaining: 7,
  resets_at: "2026-08-11T05:01:00.000Z",
  retry_at: "2026-08-11T05:01:00.000Z",
  reservation_id: "2815d3de-039b-4fab-a38d-bd61fb80ea03",
  reserved_units: 180,
  unit: "seconds",
  user_daily_remaining: 540,
  user_monthly_remaining: 3420,
  project_daily_remaining: 3420,
  project_monthly_remaining: 17820,
  concurrency_remaining: 0,
  daily_resets_at: "2026-08-12T00:00:00.000Z",
  monthly_resets_at: "2026-09-01T00:00:00.000Z",
} as const;

describe("durable voice quota responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires the exact durable backend and fixed STT units before database access", async () => {
    const previous = process.env.FINALTAB_VOICE_DURABLE_QUOTA;
    const principal: ApiPrincipal = {
      subject: "70e7fd4b-2c63-4935-b74f-f45d26f67b17",
      name: "Voice policy test",
      scopes: new Set(["receipts:write"]),
      source: "session",
      rateKey: "voice-policy-test",
    };
    try {
      delete process.env.FINALTAB_VOICE_DURABLE_QUOTA;
      await expect(reserveDurableVoiceBudget(
        principal,
        "transcription",
        180,
      )).rejects.toMatchObject({ code: "NOT_CONFIGURED", httpStatus: 503 });

      process.env.FINALTAB_VOICE_DURABLE_QUOTA = "supabase";
      await expect(reserveDurableVoiceBudget(
        principal,
        "transcription",
        179,
      )).rejects.toMatchObject({ code: "INVALID_RESPONSE", httpStatus: 503 });
    } finally {
      if (previous === undefined) delete process.env.FINALTAB_VOICE_DURABLE_QUOTA;
      else process.env.FINALTAB_VOICE_DURABLE_QUOTA = previous;
    }
  });

  it("reserves through the server-only client for the exact Supabase user", async () => {
    const previous = process.env.FINALTAB_VOICE_DURABLE_QUOTA;
    const rpc = vi.fn().mockResolvedValue({ data: [allowedRpcRow], error: null });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({ rpc } as never);
    process.env.FINALTAB_VOICE_DURABLE_QUOTA = "supabase";
    try {
      const decision = await reserveDurableVoiceBudget({
        subject: "70e7fd4b-2c63-4935-b74f-f45d26f67b17",
        name: "Voice policy test",
        scopes: new Set(["receipts:write"]),
        source: "session",
        rateKey: "voice-policy-test",
      }, "transcription", 180);

      expect(decision.allowed).toBe(true);
      expect(rpc).toHaveBeenCalledWith("reserve_voice_budget", {
        expected_user: "70e7fd4b-2c63-4935-b74f-f45d26f67b17",
        requested_capability: "transcription",
        requested_units: 180,
      });
    } finally {
      if (previous === undefined) delete process.env.FINALTAB_VOICE_DURABLE_QUOTA;
      else process.env.FINALTAB_VOICE_DURABLE_QUOTA = previous;
    }
  });

  it("rejects machine tokens and malformed user subjects before database access", async () => {
    const previous = process.env.FINALTAB_VOICE_DURABLE_QUOTA;
    process.env.FINALTAB_VOICE_DURABLE_QUOTA = "supabase";
    try {
      for (const principal of [
        {
          subject: "machine-client",
          name: "Machine client",
          scopes: new Set(["receipts:write" as const]),
          source: "bearer-token" as const,
          rateKey: "machine-client",
        },
        {
          subject: "not-a-user-id",
          name: "Malformed user",
          scopes: new Set(["receipts:write" as const]),
          source: "session" as const,
          rateKey: "malformed-user",
        },
      ]) {
        await expect(reserveDurableVoiceBudget(principal, "transcription", 180))
          .rejects.toMatchObject({ code: "SESSION_REQUIRED", httpStatus: 403 });
      }
      expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.FINALTAB_VOICE_DURABLE_QUOTA;
      else process.env.FINALTAB_VOICE_DURABLE_QUOTA = previous;
    }
  });

  it("accepts the single-row Supabase RPC shape", () => {
    expect(parseVoiceQuotaRpcData([allowedRpcRow])).toEqual({
      allowed: true,
      reason: "reserved",
      remaining: 7,
      resetsAt: "2026-08-11T05:01:00.000Z",
      retryAt: "2026-08-11T05:01:00.000Z",
      reservationId: "2815d3de-039b-4fab-a38d-bd61fb80ea03",
      reservedUnits: 180,
      unit: "seconds",
      userDailyRemaining: 540,
      userMonthlyRemaining: 3420,
      projectDailyRemaining: 3420,
      projectMonthlyRemaining: 17820,
      concurrencyRemaining: 0,
      dailyResetsAt: "2026-08-12T00:00:00.000Z",
      monthlyResetsAt: "2026-09-01T00:00:00.000Z",
      durable: true,
    });
  });

  it("fails closed on an empty or malformed database response", () => {
    for (const value of [
      [],
      [allowedRpcRow, allowedRpcRow],
      null,
      [{ ...allowedRpcRow, allowed: "yes" }],
      [{ ...allowedRpcRow, reserved_units: 601 }],
      [{ ...allowedRpcRow, reason: "caller_selected_limit" }],
      [{ ...allowedRpcRow, reservation_id: null }],
      [{ ...allowedRpcRow, unit: "characters", concurrency_remaining: 0 }],
      [{ ...allowedRpcRow, allowed: false, reserved_units: 0 }],
    ]) {
      expect(() => parseVoiceQuotaRpcData(value)).toThrow(VoiceQuotaError);
    }
  });

  it("bounds Retry-After and exposes only quota metadata", () => {
    const now = Date.parse("2026-08-11T05:00:30.000Z");
    expect(voiceQuotaRetryAfterSeconds("2026-08-11T05:01:00.000Z", now)).toBe(30);
    expect(voiceQuotaRetryAfterSeconds("bad", now)).toBe(60);

    expect(voiceQuotaRetryAfterSeconds("2026-08-12T05:00:30.000Z", now)).toBe(86_400);

    const response = withVoiceQuotaHeaders(new Response(null), {
      allowed: false,
      reason: "user_daily_budget",
      remaining: 0,
      resetsAt: "2026-08-11T05:01:00.000Z",
      retryAt: "2026-08-12T00:00:00.000Z",
      reservationId: null,
      reservedUnits: 0,
      unit: "seconds",
      userDailyRemaining: 0,
      userMonthlyRemaining: 2880,
      projectDailyRemaining: 2700,
      projectMonthlyRemaining: 17100,
      concurrencyRemaining: 0,
      dailyResetsAt: "2026-08-12T00:00:00.000Z",
      monthlyResetsAt: "2026-09-01T00:00:00.000Z",
      durable: true,
    });
    expect(response.headers.get("x-voice-ratelimit-remaining")).toBe("0");
    expect(response.headers.get("x-voice-ratelimit-durable")).toBe("true");
    expect(response.headers.get("x-voice-budget-reserved-units")).toBe("0");
    expect(response.headers.get("x-voice-budget-unit")).toBe("seconds");
    expect(response.headers.get("x-voice-budget-user-day-remaining")).toBe("0");
    expect(response.headers.get("x-voice-concurrency-remaining")).toBe("0");
    expect(response.headers.get("x-voice-budget-project-day-remaining")).toBeNull();
    expect([...response.headers].join(" ")).not.toContain("2815d3de-039b-4fab-a38d-bd61fb80ea03");
  });
});

describe("voice spend reservation migration", () => {
  const migration = readFileSync(
    fileURLToPath(new URL(
      "../../../supabase/migrations/20260811064822_voice_spend_reservations.sql",
      import.meta.url,
    )),
    "utf8",
  );
  const cutover = readFileSync(
    fileURLToPath(new URL(
      "../../../supabase/migrations/20260811074500_financial_truth_post_promotion_cutover.sql",
      import.meta.url,
    )),
    "utf8",
  );

  it("fixes provider units and every spend/concurrency cap in trusted SQL", () => {
    expect(VOICE_STT_RESERVATION_SECONDS).toBe(180);
    expect(migration).toContain("requested_units is distinct from session_seconds");
    expect(migration).toContain("session_seconds constant integer := 180");
    expect(migration).toContain("user_daily_limit := 720");
    expect(migration).toContain("user_monthly_limit := 3600");
    expect(migration).toContain("project_daily_limit := 3600");
    expect(migration).toContain("project_monthly_limit := 18000");
    expect(migration).toContain("user_daily_limit := 2400");
    expect(migration).toContain("user_monthly_limit := 12000");
    expect(migration).toContain("project_daily_limit := 12000");
    expect(migration).toContain("project_monthly_limit := 60000");
    expect(migration).toContain("user_concurrency_limit constant integer := 1");
    expect(migration).toContain("project_concurrency_limit constant integer := 4");
    expect(migration).toContain("token_redemption_seconds + session_seconds");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(845320180240::bigint)");
    expect(migration).not.toMatch(/requested_(daily|monthly|project|user|concurrency)_limit/i);
  });

  it("serializes counters atomically and leaves no direct table mutation path", () => {
    const lockStatements = migration.match(/do update set reserved_units = budget\.reserved_units/g) ?? [];
    expect(lockStatements).toHaveLength(4);
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("caller_id uuid := expected_user");
    expect(migration).toContain("(select auth.role()) is distinct from 'service_role'");
    expect(migration.match(/enable row level security/g)).toHaveLength(3);
    expect(migration).toContain(
      "revoke all on table public.voice_user_budget_windows from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on table public.voice_project_budget_windows from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on table public.voice_spend_reservations from public, anon, authenticated",
    );
    expect(migration).toContain("revoke all on function public.reserve_voice_budget(uuid, text, integer)");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reserve_voice_budget(uuid, text, integer) to service_role");
    expect(migration).not.toContain("revoke execute on function public.consume_voice_quota(text) from authenticated");
    expect(cutover).toContain("revoke execute on function public.consume_voice_quota(text) from authenticated");
    expect(migration).toContain("create index voice_spend_reservations_user_idx");
    expect(migration).not.toMatch(/grant\s+(select|insert|update|delete).*voice_(user|project|spend)/i);
  });
});
