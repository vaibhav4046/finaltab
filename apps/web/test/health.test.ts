import { afterEach, describe, expect, it } from "vitest";
import { healthSnapshot, VERIFIED_V2_CONTRACT } from "@/lib/server/health";

const KEYS = [
  "NEXT_PUBLIC_SETTLEMENT_CONTRACT",
  "FINALTAB_SETTLEMENT_CONTRACT_VERSION",
  "KEEPERHUB_API_KEY",
  "GROQ_API_KEY",
  "CLAUDE_API_KEY",
  "OPENAI_API_KEY",
  "ASSEMBLYAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "FINALTAB_VOICE_DURABLE_QUOTA",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_VERIFICATION_KEY",
  "FINALTAB_API_TOKENS_JSON",
  "FINALTAB_PROOF_SIGNING_SECRET",
  "FINALTAB_AGENT_ATTESTATION_SECRET",
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
      checks: {
        v2Contract: false,
        keeperHub: false,
        vision: false,
        webSessionAuth: false,
        walletOwnershipLink: false,
        settlementPersistence: false,
        privyIdentityBridge: false,
        mcpAuth: false,
        shareableProof: false,
        settlementAgentAttestation: false,
        voiceQuota: false,
      },
      capabilities: {
        voiceTranscriptionConfigured: false,
        voiceReadbackConfigured: false,
        voiceDurableQuotaConfigured: false,
        privyIdentityBridgeConfigured: false,
        walletOwnershipLinkConfigured: false,
        settlementPersistenceConfigured: false,
        settlementAgentAttestationConfigured: false,
      },
    });
  });

  it("reports ready only for the verified V2 rail and every required capability", () => {
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = VERIFIED_V2_CONTRACT;
    process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION = "2";
    process.env.KEEPERHUB_API_KEY = "kh_test-only";
    process.env.GROQ_API_KEY = "configured";
    process.env.ASSEMBLYAI_API_KEY = "configured";
    process.env.ELEVENLABS_API_KEY = "configured";
    process.env.FINALTAB_VOICE_DURABLE_QUOTA = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test-only";
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "privy_test_app";
    process.env.PRIVY_VERIFICATION_KEY = [
      "-----BEGIN PUBLIC KEY-----",
      "MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "-----END PUBLIC KEY-----",
    ].join("\n");
    process.env.FINALTAB_PROOF_SIGNING_SECRET = "test-only-proof-secret-that-is-longer-than-32-bytes";
    process.env.FINALTAB_AGENT_ATTESTATION_SECRET = "test-only-agent-attestation-secret-over-32-bytes";
    expect(healthSnapshot()).toMatchObject({
      status: "ready",
      checks: {
        v2Contract: true,
        keeperHub: true,
        vision: true,
        webSessionAuth: true,
        walletOwnershipLink: true,
        settlementPersistence: true,
        privyIdentityBridge: true,
        mcpAuth: true,
        shareableProof: true,
        settlementAgentAttestation: true,
        voiceQuota: true,
      },
      capabilities: {
        voiceTranscriptionConfigured: true,
        voiceReadbackConfigured: true,
        voiceDurableQuotaConfigured: true,
        privyIdentityBridgeConfigured: true,
        walletOwnershipLinkConfigured: true,
        settlementPersistenceConfigured: true,
        settlementAgentAttestationConfigured: true,
      },
    });
  });

  it("rejects a V1 or arbitrary address even when marked version 2", () => {
    process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION = "2";
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = "0x1111111111111111111111111111111111111111";
    expect(healthSnapshot().checks.v2Contract).toBe(false);
  });

  it("does not advertise a durable voice budget without the server credential", () => {
    process.env.FINALTAB_VOICE_DURABLE_QUOTA = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    delete process.env.SUPABASE_SECRET_KEY;

    const snapshot = healthSnapshot();
    expect(snapshot.checks.webSessionAuth).toBe(true);
    expect(snapshot.checks.voiceQuota).toBe(false);
    expect(snapshot.capabilities.voiceDurableQuotaConfigured).toBe(false);
  });
});
