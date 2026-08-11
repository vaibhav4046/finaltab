import "server-only";

import { randomBytes } from "node:crypto";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function makeWalletChallenge(input: {
  origin: string;
  userId: string;
  address: `0x${string}`;
  expiresAt: Date;
}) {
  const nonce = randomBytes(24).toString("base64url");
  const message = [
    "FINALTab wallet ownership",
    "",
    `Origin: ${input.origin}`,
    `Account: ${input.userId}`,
    `Wallet: ${input.address}`,
    `Chain: Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`,
    `Nonce: ${nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
    "",
    "This signature only links this wallet to FINALTab. It does not move funds.",
  ].join("\n");
  return { nonce, message };
}
