import { afterEach, describe, expect, it } from "vitest";
import { healthSnapshot, VERIFIED_V2_CONTRACT } from "@/lib/server/health";

const KEYS = [
  "NEXT_PUBLIC_SETTLEMENT_CONTRACT",
  "FINALTAB_SETTLEMENT_CONTRACT_VERSION",
  "KEEPERHUB_API_KEY",
  "GROQ_API_KEY",
  "CLAUDE_API_KEY",
  "OPENAI_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "FINALTAB_API_TOKENS_JSON",
  "FINALTAB_PROOF_SIGNING_SECRET",
] as const;

const before = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = before[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("health readiness", () => {
  it("fails closed when production capabilities are absent", () => {
    for (const key of KEYS) delete process.env[key];
    expect(healthSnapshot()).toMatchObject({
      status: "degraded",
      checks: { v2Contract: false, keeperHub: false, vision: false, webSessionAuth: false, mcpAuth: false, shareableProof: false },
    });
  });

  it("reports ready only for the verified V2 rail and every required capability", () => {
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = VERIFIED_V2_CONTRACT;
    process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION = "2";
    process.env.KEEPERHUB_API_KEY = "kh_test-only";
    process.env.GROQ_API_KEY = "configured";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.FINALTAB_PROOF_SIGNING_SECRET = "test-only-proof-secret-that-is-longer-than-32-bytes";
    expect(healthSnapshot()).toMatchObject({
      status: "ready",
      checks: { v2Contract: true, keeperHub: true, vision: true, webSessionAuth: true, mcpAuth: true, shareableProof: true },
    });
  });

  it("rejects a V1 or arbitrary address even when marked version 2", () => {
    process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION = "2";
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = "0x1111111111111111111111111111111111111111";
    expect(healthSnapshot().checks.v2Contract).toBe(false);
  });
});
