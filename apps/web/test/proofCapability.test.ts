import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  issueProofCapability,
  proofCapabilityConfigured,
  verifyProofCapability,
} from "@/lib/server/proofCapability";

const binding = {
  executionId: "exec_share_123",
  contractAddress: "0x1111111111111111111111111111111111111111" as const,
  settlementId: `0x${"22".repeat(32)}` as const,
  ledgerHash: `0x${"33".repeat(32)}` as const,
};

describe("exact-plan proof capability", () => {
  beforeEach(() => {
    vi.stubEnv("FINALTAB_PROOF_SIGNING_SECRET", "test-only-proof-secret-that-is-longer-than-32-bytes");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("binds an expiring token to execution, contract, settlement, and ledger", () => {
    const token = issueProofCapability(binding, { nowSeconds: 1_000, ttlSeconds: 600 });
    expect(token).toBeTruthy();
    expect(verifyProofCapability(token!, binding, { nowSeconds: 1_500 })).toBe(true);
    expect(verifyProofCapability(token!, {
      ...binding,
      ledgerHash: `0x${"44".repeat(32)}`,
    }, { nowSeconds: 1_500 })).toBe(false);
  });

  it("rejects tampering and expiry", () => {
    const token = issueProofCapability(binding, { nowSeconds: 1_000, ttlSeconds: 600 })!;
    expect(verifyProofCapability(`${token.slice(0, -1)}x`, binding, { nowSeconds: 1_001 })).toBe(false);
    expect(verifyProofCapability(token, binding, { nowSeconds: 1_600 })).toBe(false);
  });

  it("fails closed when no strong server secret is configured", () => {
    vi.stubEnv("FINALTAB_PROOF_SIGNING_SECRET", "short");
    expect(proofCapabilityConfigured()).toBe(false);
    expect(issueProofCapability(binding)).toBeNull();
  });
});
