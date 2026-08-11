import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { BASE_SEPOLIA_CHAIN_ID } from "@finaltab/engine";

const EXECUTION_RE = /^[A-Za-z0-9_-]{6,128}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface ProofCapabilityBinding {
  executionId: string;
  contractAddress: `0x${string}`;
  settlementId: `0x${string}`;
  ledgerHash: `0x${string}`;
}

interface ProofCapabilityPayload extends ProofCapabilityBinding {
  version: 1;
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  issuedAt: number;
  expiresAt: number;
}

function configuredSecret(): Buffer | null {
  const raw = process.env.FINALTAB_PROOF_SIGNING_SECRET;
  if (!raw || Buffer.byteLength(raw, "utf8") < 32) return null;
  return Buffer.from(raw, "utf8");
}

function validBinding(binding: ProofCapabilityBinding): boolean {
  return EXECUTION_RE.test(binding.executionId) &&
    ADDRESS_RE.test(binding.contractAddress) &&
    BYTES32_RE.test(binding.settlementId) &&
    BYTES32_RE.test(binding.ledgerHash);
}

function normalizedBinding(binding: ProofCapabilityBinding): ProofCapabilityBinding {
  return {
    executionId: binding.executionId,
    contractAddress: binding.contractAddress.toLowerCase() as `0x${string}`,
    settlementId: binding.settlementId.toLowerCase() as `0x${string}`,
    ledgerHash: binding.ledgerHash.toLowerCase() as `0x${string}`,
  };
}

function signature(encodedPayload: string, secret: Buffer): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function proofCapabilityConfigured(): boolean {
  return configuredSecret() !== null;
}

/**
 * Issue a shareable, read-only capability for one exact public chain proof.
 * The token never authorizes settlement preparation or execution.
 */
export function issueProofCapability(
  binding: ProofCapabilityBinding,
  options: { nowSeconds?: number; ttlSeconds?: number } = {},
): string | null {
  const secret = configuredSecret();
  if (!secret || !validBinding(binding)) return null;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isSafeInteger(nowSeconds) || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error("proof capability TTL must be 60 seconds to 30 days");
  }
  const payload: ProofCapabilityPayload = {
    version: 1,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    ...normalizedBinding(binding),
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function verifyProofCapability(
  token: string,
  expected: ProofCapabilityBinding,
  options: { nowSeconds?: number } = {},
): boolean {
  const secret = configuredSecret();
  if (!secret || token.length < 80 || token.length > 2048 || !validBinding(expected)) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  try {
    const actualSignature = Buffer.from(parts[1], "base64url");
    const expectedSignature = signature(parts[0], secret);
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) return false;

    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<ProofCapabilityPayload>;
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (
      payload.version !== 1 ||
      payload.chainId !== BASE_SEPOLIA_CHAIN_ID ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      (payload.issuedAt as number) > nowSeconds + 30 ||
      (payload.expiresAt as number) <= nowSeconds ||
      (payload.expiresAt as number) - (payload.issuedAt as number) > MAX_TTL_SECONDS
    ) return false;
    const normalized = normalizedBinding(expected);
    return payload.executionId === normalized.executionId &&
      payload.contractAddress?.toLowerCase() === normalized.contractAddress &&
      payload.settlementId?.toLowerCase() === normalized.settlementId &&
      payload.ledgerHash?.toLowerCase() === normalized.ledgerHash;
  } catch {
    return false;
  }
}

export const proofCapabilityInternals = {
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
};
