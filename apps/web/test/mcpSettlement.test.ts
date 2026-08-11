import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  allocateMcpReceipt,
  broadcastApprovalMessage,
  createBroadcastApprovalChallenge,
  isDemoMoneyEnabled,
  mcpScopesForPayload,
  prepareMcpReceiptSettlement,
  requiredMcpV2Contract,
  verifyBroadcastApproval,
  type McpReceiptAllocationInput,
} from "../lib/server/mcpSettlement";

const CONTRACT = "0x1111111111111111111111111111111111111111" as const;
const PAYER = "0x2222222222222222222222222222222222222222" as const;
const debtorA = privateKeyToAccount(generatePrivateKey());
const debtorB = privateKeyToAccount(generatePrivateKey());

function receiptInput(): McpReceiptAllocationInput {
  return {
    receipt: {
      id: "receipt-aug-11",
      currency: "USD",
      lines: [
        { id: "food", label: "Shared food", amountUsd: "49.01" },
        { id: "tip", label: "Tip", amountUsd: "5.00" },
      ],
      statedTotalUsd: "54.01",
    },
    participants: [
      { id: "payer", name: "Payer", address: PAYER },
      { id: "alex", name: "Alex", address: debtorA.address },
      { id: "blair", name: "Blair", address: debtorB.address },
    ],
    assignments: [
      {
        lineId: "food",
        weights: [
          { participantId: "payer", weight: 1 },
          { participantId: "alex", weight: 2 },
          { participantId: "blair", weight: 1 },
        ],
      },
      {
        lineId: "tip",
        weights: [
          { participantId: "payer", weight: 1 },
          { participantId: "alex", weight: 1 },
          { participantId: "blair", weight: 1 },
        ],
      },
    ],
  };
}

describe("MCP receipt allocation", () => {
  it("allocates every line and the aggregate cent-perfectly", () => {
    const allocation = allocateMcpReceipt(receiptInput());
    expect(allocation.totalMinor).toBe(5401n);
    expect(allocation.lines.map((line) => line.shares.reduce((total, share) => total + share.amountMinor, 0n)))
      .toEqual([4901n, 500n]);
    expect(allocation.shares.reduce((total, share) => total + share.amountMinor, 0n)).toBe(5401n);
  });

  it("rejects arithmetic drift and incomplete assignments", () => {
    const badTotal = receiptInput();
    badTotal.receipt.statedTotalUsd = "54.00";
    expect(() => allocateMcpReceipt(badTotal)).toThrow(/arithmetic mismatch/);

    const missing = receiptInput();
    missing.assignments.pop();
    expect(() => allocateMcpReceipt(missing)).toThrow(/exactly one assignment/);
  });
});

describe("MCP V2 plan preparation", () => {
  it("builds plan-bound authorization requests for arbitrary user wallets", () => {
    const prepared = prepareMcpReceiptSettlement(
      { ...receiptInput(), payerId: "payer", validBefore: "4600" },
      CONTRACT,
      1000,
    );
    expect(prepared.settlementId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(prepared.ledgerHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(prepared.debits).toHaveLength(2);
    expect(prepared.payouts).toEqual([{
      creditor: PAYER.toLowerCase(),
      value: prepared.debits.reduce((total, debit) => total + BigInt(debit.value), 0n).toString(),
    }]);
    expect(prepared.signatureRequests).toHaveLength(2);
    for (const request of prepared.signatureRequests) {
      expect(request.nonce).toMatch(/^0x[0-9a-f]{64}$/);
      expect(request.receiveWithAuthorization).toMatchObject({
        primaryType: "ReceiveWithAuthorization",
        message: { from: request.debtor, to: CONTRACT, value: request.value },
      });
      expect(request.settlementConsent).toMatchObject({
        primaryType: "SettlementConsent",
        message: { planHash: prepared.settlementId, debtor: request.debtor, value: request.value },
      });
    }
  });

  it("is invariant to participant input order", () => {
    const input = receiptInput();
    const reordered = receiptInput();
    reordered.participants.reverse();
    const first = prepareMcpReceiptSettlement({ ...input, payerId: "payer", validBefore: "4600" }, CONTRACT, 1000);
    const second = prepareMcpReceiptSettlement({ ...reordered, payerId: "payer", validBefore: "4600" }, CONTRACT, 1000);
    expect(second.canonicalLedgerJson).toBe(first.canonicalLedgerJson);
    expect(second.settlementId).toBe(first.settlementId);
  });
});

describe("MCP human broadcast approval", () => {
  const settlementId = `0x${"ab".repeat(32)}`;
  const ledgerHash = `0x${"cd".repeat(32)}`;
  const approvalId = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts a fresh plan-bound wallet signature", async () => {
    const challenge = createBroadcastApprovalChallenge({
      principalSubject: "api-user-7",
      approver: debtorA.address,
      contractAddress: CONTRACT,
      settlementId,
      ledgerHash,
      ttlSeconds: 600,
      nowSeconds: 1000,
      approvalId,
    });
    const signature = await debtorA.signMessage({ message: challenge.message });
    expect(challenge.message).toBe(broadcastApprovalMessage(challenge.artifact));
    await expect(verifyBroadcastApproval({
      approval: { ...challenge.artifact, signature },
      principalSubject: "api-user-7",
      contractAddress: CONTRACT,
      settlementId,
      ledgerHash,
      allowedApprovers: [debtorA.address],
      nowSeconds: 1100,
    })).resolves.toEqual({ approvalId, approver: debtorA.address.toLowerCase() });
  });

  it("rejects a different principal, plan, signer, or expired artifact", async () => {
    const challenge = createBroadcastApprovalChallenge({
      principalSubject: "api-user-7",
      approver: debtorA.address,
      contractAddress: CONTRACT,
      settlementId,
      ledgerHash,
      ttlSeconds: 600,
      nowSeconds: 1000,
      approvalId,
    });
    const approval = { ...challenge.artifact, signature: await debtorA.signMessage({ message: challenge.message }) };
    const base = {
      approval,
      principalSubject: "api-user-7",
      contractAddress: CONTRACT,
      settlementId,
      ledgerHash,
      allowedApprovers: [debtorA.address],
      nowSeconds: 1100,
    };
    await expect(verifyBroadcastApproval({ ...base, principalSubject: "another-user" })).rejects.toThrow(/another API principal/);
    await expect(verifyBroadcastApproval({ ...base, settlementId: `0x${"ef".repeat(32)}` })).rejects.toThrow(/another settlement plan/);
    await expect(verifyBroadcastApproval({ ...base, allowedApprovers: [debtorB.address] })).rejects.toThrow(/not authorized/);
    await expect(verifyBroadcastApproval({ ...base, nowSeconds: 1600 })).rejects.toThrow(/expired/);
  });
});

describe("MCP request scope and demo gates", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires every scope in a JSON-RPC batch and treats unknown tools as submit", () => {
    expect(mcpScopesForPayload([
      { jsonrpc: "2.0", method: "tools/list", id: 1 },
      { jsonrpc: "2.0", method: "tools/call", params: { name: "allocate_receipt" }, id: 2 },
      { jsonrpc: "2.0", method: "tools/call", params: { name: "submit_signed_settlement" }, id: 3 },
    ])).toEqual(["settlements:prepare", "settlements:read", "settlements:submit"]);
    expect(mcpScopesForPayload({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "not_a_real_tool" },
      id: 1,
    })).toEqual(["settlements:submit"]);
  });

  it("keeps test-key money tools off unless both explicit V2 gates are set", () => {
    vi.stubEnv("FINALTAB_ENABLE_DEMO_MONEY_TOOLS", "true");
    vi.stubEnv("FINALTAB_SETTLEMENT_CONTRACT_VERSION", "1");
    expect(isDemoMoneyEnabled()).toBe(false);
    expect(() => requiredMcpV2Contract()).toThrow(/VERSION=2/);

    vi.stubEnv("FINALTAB_SETTLEMENT_CONTRACT_VERSION", "2");
    vi.stubEnv("NEXT_PUBLIC_SETTLEMENT_CONTRACT", CONTRACT);
    expect(isDemoMoneyEnabled()).toBe(true);
    expect(requiredMcpV2Contract()).toBe(CONTRACT);
  });
});
