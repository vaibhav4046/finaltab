import "server-only";
import { z } from "zod";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  EXECUTE_SETTLEMENT_ABI,
  EXECUTE_SETTLEMENT_SIGNATURE,
} from "@finaltab/engine";

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

/**
 * Where the pulled USDC goes. The signed authorizations all name the settlement
 * contract as recipient, so the real creditors survive only in this array.
 */
export const PayoutSchema = z.object({
  creditor: Address,
  value: z.string().regex(/^[1-9][0-9]*$/, "positive integer USDC minor units"),
});

export const SettleBodySchema = z
  .object({
    settlementId: Bytes32,
    ledgerHash: Bytes32,
    transfers: z.array(SignedTransferSchema).min(1).max(50),
    payouts: z.array(PayoutSchema).min(1).max(50),
  })
  .superRefine((body, ctx) => {
    // The contract reverts with PullPayoutMismatch if these differ, and refuses
    // to retain a single cent. Checking here turns a wasted onchain revert into
    // a 400, and enforces the sum(net positions) == 0 invariant server-side
    // rather than trusting the client to have netted correctly.
    const pulled = body.transfers.reduce((a, t) => a + BigInt(t.value), 0n);
    const paid = body.payouts.reduce((a, p) => a + BigInt(p.value), 0n);
    if (pulled !== paid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payouts"],
        message: `payouts must sum to pulls: pulled ${pulled}, payouts ${paid}`,
      });
    }
  });

export type SettleBody = z.infer<typeof SettleBodySchema>;

export function settlementContractAddress(): string | null {
  const addr = process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT;
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
  return addr;
}

/**
 * Args in KeeperHub contract-call shape: tuples as OBJECTS keyed by the ABI
 * component names, uints as decimal strings. KeeperHub's execute pipeline
 * rejects positional tuple arrays with "expected object for tuple" (observed
 * live 2026-08-10; simulation tolerated arrays, execution did not).
 */
export function settleArgs(body: SettleBody): unknown[] {
  return [
    body.settlementId,
    body.ledgerHash,
    body.transfers.map((t) => ({
      from: t.from,
      to: t.to,
      value: t.value,
      validAfter: t.validAfter,
      validBefore: t.validBefore,
      nonce: t.nonce,
      v: t.v,
      r: t.r,
      s: t.s,
    })),
    body.payouts.map((p) => ({ creditor: p.creditor, value: p.value })),
  ];
}

export function settleContractCall(body: SettleBody, contractAddress: string) {
  // Every authorization must name the settlement contract as recipient. USDC's
  // receiveWithAuthorization requires msg.sender == to, so anything else is
  // either a misbuilt payload or an attempt to redirect a signed pull.
  const wrong = body.transfers.find((t) => t.to.toLowerCase() !== contractAddress.toLowerCase());
  if (wrong) {
    throw new Error(`Authorization recipient must be the settlement contract, got ${wrong.to}`);
  }

  return {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    contractAddress,
    // Bare name, not the signature: KeeperHub resolves against the supplied ABI.
    functionName: "executeSettlement",
    functionArgs: JSON.stringify(settleArgs(body)),
    abi: JSON.stringify(EXECUTE_SETTLEMENT_ABI),
    taskId: `finaltab-settle-${body.settlementId.slice(2, 18)}`,
  };
}

export { BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_USDC, EXECUTE_SETTLEMENT_SIGNATURE };
export type { z };
