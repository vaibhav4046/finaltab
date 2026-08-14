import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCTION_ORIGIN,
  healthSnapshot,
  VERIFIED_V2_CONTRACT,
} from "@/lib/server/health";

const KEYS = [
  "NEXT_PUBLIC_SETTLEMENT_CONTRACT",
  "FINALTAB_SETTLEMENT_CONTRACT_VERSION",
  "FINALTAB_APP_ORIGIN",
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
  "FINALTAB_GITHUB_OAUTH_ENABLED",
  "FINALTAB_TEAM_EMAIL_AUTH_ENABLED",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_VERIFICATION_KEY",
  "FINALTAB_API_TOKENS_JSON",
  "FINALTAB_PROOF_SIGNING_SECRET",
  "FINALTAB_AGENT_ATTESTATION_SECRET",
] as const;

const before = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function configureRequiredCapabilities() {
  process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = VERIFIED_V2_CONTRACT;
  process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION = "2";
  process.env.FINALTAB_APP_ORIGIN = CANONICAL_PRODUCTION_ORIGIN;
  process.env.KEEPERHUB_API_KEY = "kh_test-only";
  process.env.GROQ_API_KEY = "configured";
  process.env.ASSEMBLYAI_API_KEY = "configured";
  process.env.ELEVENLABS_API_KEY = "configured";
  process.env.FINALTAB_VOICE_DURABLE_QUOTA = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test-only";
  process.env.FINALTAB_GITHUB_OAUTH_ENABLED = "true";
  process.env.FINALTAB_PROOF_SIGNING_SECRET = "test-only-proof-secret-that-is-longer-than-32-bytes";
  process.env.FINALTAB_AGENT_ATTESTATION_SECRET = "test-only-agent-attestation-secret-over-32-bytes";
}

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
        canonicalOrigin: false,
        webSessionAuth: false,
        githubOAuth: false,
        walletOwnershipLink: false,
        settlementPersistence: false,
        privyIdentityBridge: false,
        teamEmailAuth: false,
        mcpAuth: false,
        shareableProof: false,
        settlementAgentAttestation: false,
        voiceQuota: false,
      },
      capabilities: {
        voiceTranscriptionConfigured: false,
        voiceReadbackConfigured: false,
        voiceDurableQuotaConfigured: false,
        githubOAuthEnabled: false,
        privyIdentityBridgeConfigured: false,
        walletOwnershipLinkConfigured: false,
        settlementPersistenceConfigured: false,
        settlementAgentAttestationConfigured: false,
      },
      optional: {
        privyIdentityBridge: {
          configured: false,
          requiredForReadiness: false,
        },
        teamEmailAuth: {
          enabled: false,
          requiredForReadiness: false,
          deliveryProven: false,
        },
      },
    });
  });

  it("reports ready for every required capability while optional Privy is disabled", () => {
    configureRequiredCapabilities();
    expect(healthSnapshot()).toMatchObject({
      status: "ready",
      checks: {
        v2Contract: true,
        keeperHub: true,
        vision: true,
        canonicalOrigin: true,
        webSessionAuth: true,
        githubOAuth: true,
        walletOwnershipLink: true,
        settlementPersistence: true,
        privyIdentityBridge: false,
        teamEmailAuth: false,
        mcpAuth: true,
        shareableProof: true,
        settlementAgentAttestation: true,
        voiceQuota: true,
      },
      capabilities: {
        voiceTranscriptionConfigured: true,
        voiceReadbackConfigured: true,
        voiceDurableQuotaConfigured: true,
        githubOAuthEnabled: true,
        privyIdentityBridgeConfigured: false,
        walletOwnershipLinkConfigured: true,
        settlementPersistenceConfigured: true,
        settlementAgentAttestationConfigured: true,
      },
      optional: {
        privyIdentityBridge: {
          configured: false,
          requiredForReadiness: false,
        },
        teamEmailAuth: {
          enabled: false,
          requiredForReadiness: false,
          deliveryProven: false,
        },
      },
    });
  });

  it("keeps GitHub public auth fail-closed unless the exact server flag is true", () => {
    configureRequiredCapabilities();

    for (const value of ["false", "1", "yes", "enabled", " true-ish "]) {
      process.env.FINALTAB_GITHUB_OAUTH_ENABLED = value;
      expect(healthSnapshot()).toMatchObject({
        status: "degraded",
        checks: { githubOAuth: false },
        capabilities: { githubOAuthEnabled: false },
      });
    }

    process.env.FINALTAB_GITHUB_OAUTH_ENABLED = " TRUE ";
    expect(healthSnapshot()).toMatchObject({
      status: "ready",
      checks: { githubOAuth: true },
      capabilities: { githubOAuthEnabled: true },
    });
  });

  it("requires the exact canonical production origin for public GitHub OAuth", () => {
    configureRequiredCapabilities();

    for (const value of [
      "https://finaltab-n1p5q1cro-vaibhav4046s-projects.vercel.app",
      "http://finaltab.vercel.app",
      "https://finaltab.vercel.app/",
      "https://FINALTab.vercel.app",
    ]) {
      process.env.FINALTAB_APP_ORIGIN = value;
      expect(healthSnapshot()).toMatchObject({
        status: "degraded",
        checks: { canonicalOrigin: false, githubOAuth: false },
      });
    }

    process.env.FINALTAB_APP_ORIGIN = CANONICAL_PRODUCTION_ORIGIN;
    expect(healthSnapshot()).toMatchObject({
      status: "ready",
      checks: { canonicalOrigin: true, githubOAuth: true },
    });
  });

  it("reports the email UI as an optional unproven delivery fallback", () => {
    configureRequiredCapabilities();
    process.env.FINALTAB_TEAM_EMAIL_AUTH_ENABLED = "true";

    expect(healthSnapshot()).toMatchObject({
      status: "ready",
      checks: { teamEmailAuth: true },
      optional: {
        teamEmailAuth: {
          enabled: true,
          requiredForReadiness: false,
          deliveryProven: false,
        },
      },
    });
  });

  it("keeps partial Privy configuration optional, disabled, and ready", () => {
    configureRequiredCapabilities();
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "privy_test_app";
    delete process.env.PRIVY_VERIFICATION_KEY;

    expect(healthSnapshot()).toMatchObject({
      status: "ready",
      checks: { privyIdentityBridge: false },
      optional: {
        privyIdentityBridge: {
          configured: false,
          requiredForReadiness: false,
        },
      },
    });

    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    process.env.PRIVY_VERIFICATION_KEY = [
      "-----BEGIN PUBLIC KEY-----",
      "MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "-----END PUBLIC KEY-----",
    ].join("\n");
    expect(healthSnapshot()).toMatchObject({
      status: "ready",
      checks: { privyIdentityBridge: false },
    });
  });

  it("reports a completely configured Privy bridge as an optional capability", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "privy_test_app";
    process.env.PRIVY_VERIFICATION_KEY = [
      "-----BEGIN PUBLIC KEY-----",
      "MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "-----END PUBLIC KEY-----",
    ].join("\n");

    expect(healthSnapshot()).toMatchObject({
      status: "degraded",
      checks: { privyIdentityBridge: true },
      optional: {
        privyIdentityBridge: {
          configured: true,
          requiredForReadiness: false,
        },
      },
      capabilities: { privyIdentityBridgeConfigured: true },
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
