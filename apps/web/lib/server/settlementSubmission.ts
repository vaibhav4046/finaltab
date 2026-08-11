import "server-only";

import { BASE_SEPOLIA_CHAIN_ID } from "@finaltab/engine";
import { deriveIdempotencyKey } from "@finaltab/keeperhub";
import { keeperHubClient } from "@/lib/server/clients";
import {
  SettleBodySchema,
  requiredV2SettlementContract,
  settleContractCall,
  type SettleBody,
} from "@/lib/server/settlement";
import {
  verifyBroadcastApproval,
  type SignedBroadcastApproval,
} from "@/lib/server/mcpSettlement";
import { issueProofCapability } from "@/lib/server/proofCapability";

export class SettlementSubmissionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementSubmissionBlockedError";
  }
}

function parsedBody(value: unknown): SettleBody {
  return SettleBodySchema.parse(value);
}

function preparedCall(value: unknown) {
  const body = parsedBody(value);
  const contract = requiredV2SettlementContract();
  // This recomputes the complete V2 debit+payout plan hash, validates every
  // authorization nonce and refuses an authorization aimed at another target.
  const call = settleContractCall(body, contract);
  return { body, contract, call };
}

function requiredKeeperHubClient() {
  const { client, blockedReason } = keeperHubClient();
  if (!client) throw new SettlementSubmissionBlockedError(blockedReason ?? "KeeperHub is not configured");
  return client;
}

/** Validate the V2 plan and simulate the exact call without broadcasting. */
export async function simulateSignedSettlement(value: unknown) {
  const { body, contract, call } = preparedCall(value);
  const client = requiredKeeperHubClient();
  const simulation = await client.simulateContractCall(call);
  return { body, contract, call, client, simulation };
}

/**
 * The single server-only value-moving path for REST and MCP.
 *
 * Approval is exact-plan, principal and contract bound, but intentionally not
 * described as single-use: it may be retried until expiry. KeeperHub receives a
 * deterministic idempotency key and V2 rejects an already executed settlement.
 */
export async function submitApprovedSettlement(input: {
  signedSettlement: unknown;
  approval: SignedBroadcastApproval;
  principalSubject: string;
  allowedApprovers: readonly string[];
}) {
  const { body, contract, call } = preparedCall(input.signedSettlement);
  const verifiedApproval = await verifyBroadcastApproval({
    approval: input.approval,
    principalSubject: input.principalSubject,
    contractAddress: contract,
    settlementId: body.settlementId,
    ledgerHash: body.ledgerHash,
    allowedApprovers: input.allowedApprovers,
  });

  // Simulation is deliberately adjacent to execution. No caller can invoke the
  // broadcast half without passing this exact simulation first.
  const client = requiredKeeperHubClient();
  const simulation = await client.simulateContractCall(call);
  const idempotencyKey = deriveIdempotencyKey({
    taskId: call.taskId!,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    recipientAddress: contract,
    amount: "0",
    tokenAddress: body.settlementId,
  });
  const accepted = await client.executeContractCall(call, idempotencyKey);
  const proofCapability = issueProofCapability({
    executionId: accepted.executionId,
    contractAddress: contract,
    settlementId: body.settlementId as `0x${string}`,
    ledgerHash: body.ledgerHash as `0x${string}`,
  });

  return { body, contract, simulation, accepted, verifiedApproval, idempotencyKey, proofCapability };
}
