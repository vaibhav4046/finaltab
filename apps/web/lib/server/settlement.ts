import "server-only";
import { z } from "zod";
import { BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_USDC } from "@finaltab/engine";

/**
 * The web app only ever asks KeeperHub to call executeSettlement on the
 * FinalTab settlement contract on Base Sepolia. Everything else is rejected
 * server-side so a compromised client cannot turn this endpoint into a
 * generic transaction relay.
 */

const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const SignedTransferSchema = z.object({
  from: Address,
  to: Address,
  value: z.string().regex(/^[1-9][0-9]*$/, "positive integer USDC minor units"),
  validAfter: z.string().regex(/^[0-9]+$/),
  validBefore: z.string().regex(/^[0-9]+$/),
  nonce: Bytes32,
  v: z.number().int().min(27).max(28),
  r: Bytes32,
  s: Bytes32,
});

export const SettleBodySchema = z.object({
  settlementId: Bytes32,
  ledgerHash: Bytes32,
  transfers: z.array(SignedTransferSchema).min(1).max(50),
});

export type SettleBody = z.infer<typeof SettleBodySchema>;

export function settlementContractAddress(): string | null {
  const addr = process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT;
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
  return addr;
}

export const EXECUTE_SETTLEMENT_SIGNATURE =
  "executeSettlement(bytes32,bytes32,(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)[])";

/** Args in KeeperHub contract-call shape: tuples as arrays, uints as decimal strings. */
export function settleArgs(body: SettleBody): unknown[] {
  return [
    body.settlementId,
    body.ledgerHash,
    body.transfers.map((t) => [t.from, t.to, t.value, t.validAfter, t.validBefore, t.nonce, t.v, t.r, t.s]),
  ];
}

export function settleContractCall(body: SettleBody, contractAddress: string) {
  return {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    contractAddress,
    functionSignature: EXECUTE_SETTLEMENT_SIGNATURE,
    args: settleArgs(body),
    taskId: `finaltab-settle-${body.settlementId.slice(2, 18)}`,
  };
}

export { BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_USDC };
export type { z };
