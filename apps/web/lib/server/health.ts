import "server-only";

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
    mcpAuth: isSupabaseConfigured() || Boolean(process.env.FINALTAB_API_TOKENS_JSON),
    shareableProof: proofCapabilityConfigured(),
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
    },
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  } as const;
}
