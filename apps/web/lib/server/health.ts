import "server-only";

import { authFeatureFlags } from "@/lib/auth/features";
import { privyServerConfig } from "@/lib/privy/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { proofCapabilityConfigured } from "@/lib/server/proofCapability";
import { voiceCapabilitySnapshot } from "@/lib/server/voice";

export const VERIFIED_V2_CONTRACT = "0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB";
export const CANONICAL_PRODUCTION_ORIGIN = "https://finaltab.vercel.app";

export function healthSnapshot() {
  const configuredContract = process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT?.toLowerCase();
  const voice = voiceCapabilitySnapshot();
  const supabaseConfigured = isSupabaseConfigured();
  const authFeatures = authFeatureFlags();
  const canonicalOrigin =
    process.env.FINALTAB_APP_ORIGIN?.trim() === CANONICAL_PRODUCTION_ORIGIN;
  const requiredChecks = {
    v2Contract:
      process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION === "2" &&
      configuredContract === VERIFIED_V2_CONTRACT.toLowerCase(),
    keeperHub: process.env.KEEPERHUB_API_KEY?.startsWith("kh_") === true,
    vision: Boolean(process.env.GROQ_API_KEY || process.env.CLAUDE_API_KEY || process.env.OPENAI_API_KEY),
    canonicalOrigin,
    webSessionAuth: supabaseConfigured,
    // Configuration intent only. Operational readiness still requires a real
    // provider round trip and an authenticated RLS probe after deployment.
    githubOAuth:
      canonicalOrigin && supabaseConfigured && authFeatures.githubOAuthEnabled,
    walletOwnershipLink:
      supabaseConfigured && Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
    settlementPersistence:
      supabaseConfigured && Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
    mcpAuth: supabaseConfigured || Boolean(process.env.FINALTAB_API_TOKENS_JSON),
    shareableProof: proofCapabilityConfigured(),
    settlementAgentAttestation:
      supabaseConfigured &&
      (process.env.FINALTAB_AGENT_ATTESTATION_SECRET?.trim().length ?? 0) >= 32,
    voiceQuota:
      process.env.FINALTAB_VOICE_DURABLE_QUOTA === "supabase" &&
      supabaseConfigured &&
      Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
  };
  const optionalChecks = {
    // Supabase Auth and RLS are the production identity boundary. Privy remains
    // an optional, fail-closed wallet-provisioning bridge. It does not block
    // core product readiness when its paid custom-auth tier is not enabled.
    privyIdentityBridge: supabaseConfigured && Boolean(privyServerConfig()),
    teamEmailAuth: supabaseConfigured && authFeatures.teamEmailAuthEnabled,
  };
  const checks = { ...requiredChecks, ...optionalChecks };
  return {
    status: Object.values(requiredChecks).every(Boolean) ? "ready" : "degraded",
    environment: "base-sepolia-testnet",
    contract: VERIFIED_V2_CONTRACT,
    checks,
    optional: {
      privyIdentityBridge: {
        configured: optionalChecks.privyIdentityBridge,
        requiredForReadiness: false,
      },
      teamEmailAuth: {
        enabled: optionalChecks.teamEmailAuth,
        requiredForReadiness: false,
        deliveryProven: false,
      },
    },
    capabilities: {
      // Configuration signals only. Operational voice readiness is established
      // by a post-deploy provider + browser probe, never inferred from a key.
      voiceTranscriptionConfigured: voice.transcription,
      voiceReadbackConfigured: voice.readback,
      voiceDurableQuotaConfigured: checks.voiceQuota,
      githubOAuthEnabled: checks.githubOAuth,
      // This optional capability is reported truthfully but is not required for
      // readiness. Live enablement still requires Privy dashboard custom auth,
      // identity tokens, verification keys and exact allowed URLs.
      privyIdentityBridgeConfigured: optionalChecks.privyIdentityBridge,
      walletOwnershipLinkConfigured: checks.walletOwnershipLink,
      settlementPersistenceConfigured: checks.settlementPersistence,
      settlementAgentAttestationConfigured: checks.settlementAgentAttestation,
    },
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  } as const;
}
