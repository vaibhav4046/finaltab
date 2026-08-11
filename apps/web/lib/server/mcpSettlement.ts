import "server-only";

import { randomUUID } from "node:crypto";
import { recoverMessageAddress, type Hex } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  aggregateSettlementTransfers,
  assertSettlementCurrency,
  buildReceiveAuthorizationTypedData,
  buildSettlementConsentTypedData,
  canonicalizeLedger,
  fiatMinorToUsdcMinor,
  formatFiat,
  hashSettlementPlan,
  largestRemainderSplit,
  ledgerHash as computeLedgerHash,
  ledgerToCanonicalJson,
  parseFiat,
  settlementAuthorizationNonce,
  sum,
  type CanonicalLedger,
} from "@finaltab/engine";
import type { ApiScope } from "@/lib/server/apiAccess";
import { requiredV2SettlementContract } from "@/lib/server/settlement";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USDC_MINOR_PER_CENT = 10_000n;

export interface McpReceiptLine {
  id: string;
  label: string;
  /** USD decimal string with at most two fractional digits. */
  amountUsd: string;
}

export interface McpParticipant {
  id: string;
  name: string;
  address?: string;
}

export interface McpLineAssignment {
  lineId: string;
  weights: Array<{ participantId: string; weight: number }>;
}

export interface McpReceiptAllocationInput {
  receipt: {
    id: string;
    currency: string;
    lines: McpReceiptLine[];
    statedTotalUsd?: string;
  };
  participants: McpParticipant[];
  assignments: McpLineAssignment[];
}

export interface McpAllocationResult {
  receiptId: string;
  currency: "USD";
  totalMinor: bigint;
  participants: Array<{ id: string; name: string; address?: `0x${string}` }>;
  lines: Array<{
    id: string;
    label: string;
    amountMinor: bigint;
    shares: Array<{ participantId: string; amountMinor: bigint }>;
  }>;
  shares: Array<{ participantId: string; amountMinor: bigint }>;
}

function normalizedId(value: string, kind: string): string {
  const id = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
    throw new Error(`${kind} must match [a-z0-9][a-z0-9_-]{0,63}`);
  }
  return id;
}

function requiredLabel(value: string, kind: string): string {
  const label = value.trim();
  if (label.length === 0 || label.length > 160) throw new Error(`${kind} must be 1-160 characters`);
  return label;
}

function unique<T>(values: T[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

/**
 * Deterministically allocate every receipt line with largest remainder.
 * Items, service, tax, and tip are all explicit lines, so the output can be
 * audited back to the caller-supplied receipt without hidden rounding rules.
 */
export function allocateMcpReceipt(input: McpReceiptAllocationInput): McpAllocationResult {
  assertSettlementCurrency(input.receipt.currency);
  const receiptId = requiredLabel(input.receipt.id, "receipt id");
  if (input.participants.length < 1 || input.participants.length > 50) {
    throw new Error("participants must contain 1-50 entries");
  }
  if (input.receipt.lines.length < 1 || input.receipt.lines.length > 200) {
    throw new Error("receipt lines must contain 1-200 entries");
  }

  const participants = input.participants.map((participant) => {
    const id = normalizedId(participant.id, "participant id");
    const address = participant.address?.toLowerCase();
    if (address !== undefined && !ADDRESS_RE.test(address)) {
      throw new Error(`invalid address for participant ${id}`);
    }
    return {
      id,
      name: requiredLabel(participant.name, `name for ${id}`),
      address: address as `0x${string}` | undefined,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  unique(participants.map((participant) => participant.id), "participant ids must be unique");
  const addresses = participants.flatMap((participant) => participant.address ? [participant.address] : []);
  unique(addresses, "participant wallet addresses must be unique");
  const participantIndex = new Map(participants.map((participant, index) => [participant.id, index]));

  const lines = input.receipt.lines.map((line) => ({
    id: normalizedId(line.id, "line id"),
    label: requiredLabel(line.label, `label for ${line.id}`),
    amountMinor: parseFiat(line.amountUsd),
  }));
  unique(lines.map((line) => line.id), "receipt line ids must be unique");
  if (lines.some((line) => line.amountMinor <= 0n)) throw new Error("every receipt line must be positive");

  const assignments = new Map<string, McpLineAssignment>();
  for (const assignment of input.assignments) {
    const lineId = normalizedId(assignment.lineId, "assignment line id");
    if (assignments.has(lineId)) throw new Error(`duplicate assignment for line ${lineId}`);
    assignments.set(lineId, assignment);
  }
  if (assignments.size !== lines.length) throw new Error("every receipt line must have exactly one assignment");

  const aggregate = Array.from({ length: participants.length }, () => 0n);
  const allocatedLines = lines.map((line) => {
    const assignment = assignments.get(line.id);
    if (!assignment) throw new Error(`missing assignment for line ${line.id}`);
    const seen = new Set<string>();
    const weights = Array.from({ length: participants.length }, () => 0n);
    for (const entry of assignment.weights) {
      const participantId = normalizedId(entry.participantId, "assignment participant id");
      const index = participantIndex.get(participantId);
      if (index === undefined) throw new Error(`assignment references unknown participant ${participantId}`);
      if (seen.has(participantId)) throw new Error(`duplicate weight for ${participantId} on line ${line.id}`);
      if (!Number.isSafeInteger(entry.weight) || entry.weight < 0 || entry.weight > 1_000_000) {
        throw new Error(`weight for ${participantId} on line ${line.id} must be a safe integer 0-1000000`);
      }
      seen.add(participantId);
      weights[index] = BigInt(entry.weight);
    }
    const shares = largestRemainderSplit(line.amountMinor, weights);
    shares.forEach((share, index) => { aggregate[index] = aggregate[index]! + share; });
    return {
      ...line,
      shares: shares.flatMap((share, index) => share > 0n
        ? [{ participantId: participants[index]!.id, amountMinor: share }]
        : []),
    };
  });

  const totalMinor = sum(lines.map((line) => line.amountMinor));
  if (input.receipt.statedTotalUsd !== undefined && parseFiat(input.receipt.statedTotalUsd) !== totalMinor) {
    throw new Error(
      `receipt arithmetic mismatch: lines sum to ${formatFiat(totalMinor)}, stated total is ${input.receipt.statedTotalUsd}`,
    );
  }
  if (sum(aggregate) !== totalMinor) throw new Error("allocation conservation invariant failed");

  return {
    receiptId,
    currency: "USD",
    totalMinor,
    participants,
    lines: allocatedLines,
    shares: participants.map((participant, index) => ({
      participantId: participant.id,
      amountMinor: aggregate[index]!,
    })),
  };
}

export interface PreparedMcpSettlement {
  allocation: McpAllocationResult;
  payerId: string;
  canonicalLedgerJson: string;
  ledgerHash: `0x${string}`;
  settlementId: `0x${string}`;
  transfers: Array<{ from: `0x${string}`; to: `0x${string}`; value: string }>;
  debits: Array<{ debtor: `0x${string}`; value: string }>;
  payouts: Array<{ creditor: `0x${string}`; value: string }>;
  signatureRequests: Array<{
    debtor: `0x${string}`;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: `0x${string}`;
    receiveWithAuthorization: Record<string, unknown>;
    settlementConsent: Record<string, unknown>;
  }>;
}

function jsonTypedData(data: {
  domain: object;
  types: object;
  primaryType: string;
  message: object;
}): Record<string, unknown> {
  return {
    domain: data.domain,
    types: data.types,
    primaryType: data.primaryType,
    message: Object.fromEntries(
      Object.entries(data.message).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]),
    ),
  };
}

/** Build a V2 plan and the exact two typed-data payloads each debtor signs. */
export function prepareMcpReceiptSettlement(
  input: McpReceiptAllocationInput & { payerId: string; validBefore?: string },
  settlementContract: `0x${string}`,
  nowSeconds = Math.floor(Date.now() / 1000),
): PreparedMcpSettlement {
  if (!ADDRESS_RE.test(settlementContract)) throw new Error("invalid V2 settlement contract address");
  const allocation = allocateMcpReceipt(input);
  if (allocation.participants.some((participant) => !participant.address)) {
    throw new Error("every participant needs a wallet address before settlement preparation");
  }
  const payerId = normalizedId(input.payerId, "payer id");
  const payer = allocation.participants.find((participant) => participant.id === payerId);
  if (!payer?.address) throw new Error(`payer ${payerId} is not a participant with a wallet address`);

  const validAfter = 0n;
  const validBefore = input.validBefore === undefined ? BigInt(nowSeconds + 3600) : BigInt(input.validBefore);
  if (validBefore < BigInt(nowSeconds + 300) || validBefore > BigInt(nowSeconds + 86_400)) {
    throw new Error("validBefore must be 5 minutes to 24 hours in the future");
  }

  const transfers = allocation.shares.flatMap((share) => {
    const participant = allocation.participants.find((candidate) => candidate.id === share.participantId)!;
    if (participant.id === payerId || share.amountMinor === 0n) return [];
    return [{
      from: participant.address!,
      to: payer.address!,
      value: fiatMinorToUsdcMinor(share.amountMinor),
    }];
  }).sort((left, right) => {
    const from = left.from.toLowerCase().localeCompare(right.from.toLowerCase());
    return from !== 0 ? from : left.to.toLowerCase().localeCompare(right.to.toLowerCase());
  });
  if (transfers.length === 0) throw new Error("the payer owes the entire receipt; there is nothing to settle");

  const ledger: CanonicalLedger = canonicalizeLedger({
    version: 1,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    participants: allocation.participants.map((participant) => ({
      id: participant.id,
      displayName: participant.name,
      address: participant.address!,
    })),
    transfers,
    receiptIds: [allocation.receiptId],
  });
  const ledgerHash = computeLedgerHash(ledger);
  const aggregated = aggregateSettlementTransfers(ledger.transfers);
  const settlementId = hashSettlementPlan({
    ledgerHash,
    settlementContract,
    debits: aggregated.debits,
    payouts: aggregated.payouts,
  });
  const signatureRequests = aggregated.debits.map((debit) => {
    const nonce = settlementAuthorizationNonce(settlementId, debit.debtor, debit.value);
    return {
      debtor: debit.debtor,
      value: debit.value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
      receiveWithAuthorization: jsonTypedData(buildReceiveAuthorizationTypedData({
        from: debit.debtor,
        to: settlementContract,
        value: debit.value,
        validAfter,
        validBefore,
        nonce,
      })),
      settlementConsent: jsonTypedData(buildSettlementConsentTypedData(settlementContract, {
        planHash: settlementId,
        debtor: debit.debtor,
        value: debit.value,
        validAfter,
        validBefore,
      })),
    };
  });

  return {
    allocation,
    payerId,
    canonicalLedgerJson: ledgerToCanonicalJson(ledger),
    ledgerHash,
    settlementId,
    transfers: ledger.transfers.map((transfer) => ({
      from: transfer.from,
      to: transfer.to,
      value: transfer.value.toString(),
    })),
    debits: aggregated.debits.map((debit) => ({ debtor: debit.debtor, value: debit.value.toString() })),
    payouts: aggregated.payouts.map((payout) => ({ creditor: payout.creditor, value: payout.value.toString() })),
    signatureRequests,
  };
}

export interface BroadcastApprovalArtifact {
  version: 1;
  approvalId: string;
  principalSubject: string;
  approver: `0x${string}`;
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  contractAddress: `0x${string}`;
  settlementId: `0x${string}`;
  ledgerHash: `0x${string}`;
  issuedAt: string;
  expiresAt: string;
}

export interface SignedBroadcastApproval extends BroadcastApprovalArtifact {
  signature: `0x${string}`;
}

export function broadcastApprovalMessage(artifact: BroadcastApprovalArtifact): string {
  return [
    "FINALTab V2 KeeperHub broadcast approval",
    "I approve simulation-first KeeperHub submission of this exact signed settlement plan during the validity window.",
    "This approval may be retried before expiry; the exact settlement identity is the idempotency and onchain replay boundary.",
    `Approval ID: ${artifact.approvalId}`,
    `Principal: ${artifact.principalSubject}`,
    `Chain ID: ${artifact.chainId}`,
    `Contract: ${artifact.contractAddress.toLowerCase()}`,
    `Settlement plan: ${artifact.settlementId.toLowerCase()}`,
    `Ledger: ${artifact.ledgerHash.toLowerCase()}`,
    `Issued at: ${artifact.issuedAt}`,
    `Expires at: ${artifact.expiresAt}`,
  ].join("\n");
}

export function createBroadcastApprovalChallenge(input: {
  principalSubject: string;
  approver: string;
  contractAddress: string;
  settlementId: string;
  ledgerHash: string;
  ttlSeconds?: number;
  nowSeconds?: number;
  approvalId?: string;
}): { artifact: BroadcastApprovalArtifact; message: string } {
  if (input.principalSubject.trim().length < 1 || input.principalSubject.length > 200) {
    throw new Error("principal subject must be 1-200 characters");
  }
  if (!ADDRESS_RE.test(input.approver)) throw new Error("invalid approval wallet address");
  if (!ADDRESS_RE.test(input.contractAddress)) throw new Error("invalid settlement contract address");
  if (!BYTES32_RE.test(input.settlementId) || !BYTES32_RE.test(input.ledgerHash)) {
    throw new Error("settlementId and ledgerHash must be bytes32 values");
  }
  const ttlSeconds = input.ttlSeconds ?? 600;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 900) {
    throw new Error("approval TTL must be 60-900 seconds");
  }
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const approvalId = input.approvalId ?? randomUUID();
  if (!UUID_RE.test(approvalId)) throw new Error("approvalId must be a UUID");
  const artifact: BroadcastApprovalArtifact = {
    version: 1,
    approvalId: approvalId.toLowerCase(),
    principalSubject: input.principalSubject.trim(),
    approver: input.approver.toLowerCase() as `0x${string}`,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    contractAddress: input.contractAddress.toLowerCase() as `0x${string}`,
    settlementId: input.settlementId.toLowerCase() as `0x${string}`,
    ledgerHash: input.ledgerHash.toLowerCase() as `0x${string}`,
    issuedAt: String(nowSeconds),
    expiresAt: String(nowSeconds + ttlSeconds),
  };
  return { artifact, message: broadcastApprovalMessage(artifact) };
}

/** Verify a short-lived EIP-191 approval before any KeeperHub broadcast. */
export async function verifyBroadcastApproval(input: {
  approval: SignedBroadcastApproval;
  principalSubject: string;
  contractAddress: string;
  settlementId: string;
  ledgerHash: string;
  allowedApprovers: readonly string[];
  nowSeconds?: number;
}): Promise<{ approvalId: string; approver: `0x${string}` }> {
  const { approval } = input;
  if (
    approval.version !== 1 ||
    approval.chainId !== BASE_SEPOLIA_CHAIN_ID ||
    !UUID_RE.test(approval.approvalId) ||
    !ADDRESS_RE.test(approval.approver) ||
    !ADDRESS_RE.test(approval.contractAddress) ||
    !BYTES32_RE.test(approval.settlementId) ||
    !BYTES32_RE.test(approval.ledgerHash) ||
    !SIGNATURE_RE.test(approval.signature)
  ) throw new Error("malformed broadcast approval artifact");
  if (approval.principalSubject !== input.principalSubject) throw new Error("approval belongs to another API principal");
  if (approval.contractAddress.toLowerCase() !== input.contractAddress.toLowerCase()) {
    throw new Error("approval is bound to another settlement contract");
  }
  if (
    approval.settlementId.toLowerCase() !== input.settlementId.toLowerCase() ||
    approval.ledgerHash.toLowerCase() !== input.ledgerHash.toLowerCase()
  ) throw new Error("approval is bound to another settlement plan");

  const issuedAt = Number(approval.issuedAt);
  const expiresAt = Number(approval.expiresAt);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) throw new Error("invalid approval timestamps");
  if (issuedAt > nowSeconds + 30 || expiresAt <= nowSeconds || expiresAt - issuedAt < 60 || expiresAt - issuedAt > 900) {
    throw new Error("broadcast approval is expired or outside the 60-900 second validity window");
  }
  const allowed = new Set(input.allowedApprovers.map((address) => address.toLowerCase()));
  if (!allowed.has(approval.approver.toLowerCase())) throw new Error("approval signer is not authorized for this plan");

  const recovered = await recoverMessageAddress({
    message: broadcastApprovalMessage(approval),
    signature: approval.signature as Hex,
  });
  if (recovered.toLowerCase() !== approval.approver.toLowerCase()) {
    throw new Error("broadcast approval signature does not match approver");
  }
  return { approvalId: approval.approvalId.toLowerCase(), approver: approval.approver.toLowerCase() as `0x${string}` };
}

const TOOL_SCOPE: Readonly<Record<string, ApiScope>> = {
  split_equal: "tabs:read",
  split_weighted: "tabs:read",
  net_debts: "tabs:read",
  allocate_receipt: "settlements:prepare",
  prepare_receipt_settlement: "settlements:prepare",
  simulate_signed_settlement: "settlements:prepare",
  create_broadcast_approval_challenge: "settlements:prepare",
  submit_signed_settlement: "settlements:submit",
  settlement_status: "settlements:read",
  demo_get_balances: "settlements:read",
  demo_prepare_settlement: "settlements:prepare",
  demo_settle_tab: "settlements:submit",
};

/** Map JSON-RPC batches to every scope they can exercise; unknown tools fail closed to submit. */
export function mcpScopesForPayload(payload: unknown): ApiScope[] {
  const messages = Array.isArray(payload) ? payload : [payload];
  const scopes = new Set<ApiScope>();
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      scopes.add("settlements:submit");
      continue;
    }
    const record = message as Record<string, unknown>;
    if (record.method !== "tools/call") {
      scopes.add("settlements:read");
      continue;
    }
    const params = record.params;
    const name = params && typeof params === "object" && !Array.isArray(params)
      ? (params as Record<string, unknown>).name
      : undefined;
    scopes.add(typeof name === "string" ? (TOOL_SCOPE[name] ?? "settlements:submit") : "settlements:submit");
  }
  return [...scopes].sort();
}

export function isDemoMoneyEnabled(): boolean {
  return process.env.FINALTAB_ENABLE_DEMO_MONEY_TOOLS === "true" &&
    process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION === "2";
}

/** MCP money tools refuse an unversioned address so V1 can never be called accidentally. */
export function requiredMcpV2Contract(): `0x${string}` {
  return requiredV2SettlementContract();
}

export const mcpSettlementInternals = {
  ADDRESS_RE,
  BYTES32_RE,
  SIGNATURE_RE,
  UUID_RE,
  USDC_MINOR_PER_CENT,
};
