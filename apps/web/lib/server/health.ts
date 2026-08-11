import "server-only";

import { privyServerConfig } from "@/lib/privy/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { proofCapabilityConfigured } from "@/lib/server/proofCapability";
import { voiceCapabilitySnapshot } from "@/lib/server/voice";

export const VERIFIED_V2_CONTRACT = "0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB";

export function healthSnapshot() {
  const configuredContract = process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT?.toLowerCase();
  const voice = voiceCapabilitySnapshot();
  const checks = {
    v2Contract:
      process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION === "2" &&
      configuredContract === VERIFIED_V2_CONTRACT.toLowerCase(),
    keeperHub: process.env.KEEPERHUB_API_KEY?.startsWith("kh_") === true,
    vision: Boolean(process.env.GROQ_API_KEY || process.env.CLAUDE_API_KEY || process.env.OPENAI_API_KEY),
    webSessionAuth: isSupabaseConfigured(),
    walletOwnershipLink:
      isSupabaseConfigured() && Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
    settlementPersistence:
      isSupabaseConfigured() && Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
    privyIdentityBridge: isSupabaseConfigured() && Boolean(privyServerConfig()),
    mcpAuth: isSupabaseConfigured() || Boolean(process.env.FINALTAB_API_TOKENS_JSON),
    shareableProof: proofCapabilityConfigured(),
    settlementAgentAttestation:
      isSupabaseConfigured() &&
      (process.env.FINALTAB_AGENT_ATTESTATION_SECRET?.trim().length ?? 0) >= 32,
    voiceQuota:
      process.env.FINALTAB_VOICE_DURABLE_QUOTA === "supabase" &&
      isSupabaseConfigured() &&
      Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
  };
  return {
    status: Object.values(checks).every(Boolean) ? "ready" : "degraded",
    environment: "base-sepolia-testnet",
    contract: VERIFIED_V2_CONTRACT,
    checks,
    capabilities: {
      // Configuration signals only. Operational voice readiness is established
      // by a post-deploy provider + browser probe, never inferred from a key.
      voiceTranscriptionConfigured: voice.transcription,
      voiceReadbackConfigured: voice.readback,
      voiceDurableQuotaConfigured: checks.voiceQuota,
      // This is configuration readiness only. Live readiness additionally
      // requires Privy dashboard custom auth, identity tokens and allowed URLs.
      privyIdentityBridgeConfigured: checks.privyIdentityBridge,
      walletOwnershipLinkConfigured: checks.walletOwnershipLink,
      settlementPersistenceConfigured: checks.settlementPersistence,
      settlementAgentAttestationConfigured: checks.settlementAgentAttestation,
    },
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  } as const;
}
