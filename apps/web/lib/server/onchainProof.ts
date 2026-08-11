import "server-only";

import type { ExecutionReceipt, ExecutionStatusResponse } from "@finaltab/keeperhub";
import { BASE_SEPOLIA_CHAIN_ID } from "@finaltab/engine";
import { keccak256, toHex } from "viem";

interface RpcReceipt {
  transactionHash: string;
  blockNumber: string;
  status: string;
  logs: Array<{ address?: string; topics?: string[] }>;
}

export interface IndependentReceiptProof {
  hash: string;
  verified: boolean;
  reason: string;
  blockNumber?: number;
  confirmations?: number;
  contractLogFound?: boolean;
  settlementBindingFound?: boolean;
  observedSettlementId?: string;
  observedLedgerHash?: string;
}

export interface IndependentExecutionProof {
  method: "base-sepolia-json-rpc";
  checkedAt: string;
  verified: boolean;
  receipts: IndependentReceiptProof[];
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const SETTLEMENT_EXECUTED_TOPIC = keccak256(
  toHex("SettlementExecuted(bytes32,bytes32,uint256,uint256,uint256)"),
).toLowerCase();

export interface ExpectedSettlementProof {
  contractAddress: `0x${string}`;
  settlementId: `0x${string}`;
  ledgerHash: `0x${string}`;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const body = (await response.json()) as { result?: T; error?: { message?: string } };
    if (body.error || body.result === undefined) throw new Error(body.error?.message ?? "RPC result missing");
    return body.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyReceipt(
  keeperHub: ExecutionReceipt,
  latestBlock: number,
  contractAddress: string | null,
  expected: ExpectedSettlementProof | null,
): Promise<IndependentReceiptProof> {
  if (keeperHub.chainId !== BASE_SEPOLIA_CHAIN_ID || !HASH_RE.test(keeperHub.hash)) {
    return { hash: keeperHub.hash, verified: false, reason: "Unexpected chain or malformed transaction hash." };
  }
  const receipt = await rpc<RpcReceipt | null>("eth_getTransactionReceipt", [keeperHub.hash]);
  if (!receipt) return { hash: keeperHub.hash, verified: false, reason: "RPC has no transaction receipt." };
  const blockNumber = Number.parseInt(receipt.blockNumber, 16);
  const confirmations = Number.isFinite(blockNumber) ? Math.max(0, latestBlock - blockNumber + 1) : 0;
  const settlementLog = contractAddress
    ? receipt.logs.find((log) =>
        log.address?.toLowerCase() === contractAddress.toLowerCase() &&
        log.topics?.[0]?.toLowerCase() === SETTLEMENT_EXECUTED_TOPIC &&
        HASH_RE.test(log.topics?.[1] ?? "") &&
        HASH_RE.test(log.topics?.[2] ?? ""))
    : undefined;
  const contractLogFound = Boolean(settlementLog);
  const observedSettlementId = settlementLog?.topics?.[1]?.toLowerCase();
  const observedLedgerHash = settlementLog?.topics?.[2]?.toLowerCase();
  const settlementBindingFound = Boolean(
    expected &&
    observedSettlementId === expected.settlementId.toLowerCase() &&
    observedLedgerHash === expected.ledgerHash.toLowerCase(),
  );
  const hashMatches = receipt.transactionHash.toLowerCase() === keeperHub.hash.toLowerCase();
  const blockMatches = keeperHub.blockNumber === undefined || keeperHub.blockNumber === blockNumber;
  const success = receipt.status === "0x1";
  const verified =
    hashMatches &&
    blockMatches &&
    success &&
    confirmations >= 1 &&
    contractLogFound &&
    settlementBindingFound;
  const failures = [
    !hashMatches && "transaction hash mismatch",
    !blockMatches && "block mismatch",
    !success && "receipt status is not success",
    confirmations < 1 && "receipt has no confirmation",
    !contractLogFound && "expected V2 SettlementExecuted event is absent",
    !expected && "expected settlementId and ledgerHash were not supplied",
    expected && contractLogFound && !settlementBindingFound && "SettlementExecuted event belongs to a different frozen plan",
  ].filter(Boolean);
  return {
    hash: keeperHub.hash,
    verified,
    reason: verified
      ? "RPC receipt, block, success status, V2 contract, settlementId, and ledgerHash all match."
      : failures.join("; "),
    blockNumber,
    confirmations,
    contractLogFound,
    settlementBindingFound,
    observedSettlementId,
    observedLedgerHash,
  };
}

/** Re-fetch KeeperHub's hashes from an independent public Base Sepolia RPC. */
export async function verifyExecutionOnchain(
  execution: ExecutionStatusResponse,
  expected: ExpectedSettlementProof | null = null,
): Promise<IndependentExecutionProof> {
  const checkedAt = new Date().toISOString();
  const receipts = Array.isArray(execution.receipts) ? execution.receipts : [];
  if (receipts.length === 0) {
    return { method: "base-sepolia-json-rpc", checkedAt, verified: false, receipts: [] };
  }
  try {
    const latestHex = await rpc<string>("eth_blockNumber", []);
    const latest = Number.parseInt(latestHex, 16);
    const contract = expected?.contractAddress ?? null;
    const independent = await Promise.all(
      receipts.map((receipt) => verifyReceipt(receipt, latest, contract, expected)),
    );
    return {
      method: "base-sepolia-json-rpc",
      checkedAt,
      verified: independent.length > 0 && independent.every((proof) => proof.verified),
      receipts: independent,
    };
  } catch (cause) {
    return {
      method: "base-sepolia-json-rpc",
      checkedAt,
      verified: false,
      receipts: receipts.map((receipt) => ({
        hash: receipt.hash,
        verified: false,
        reason: cause instanceof Error ? cause.message : "Independent RPC verification failed.",
      })),
    };
  }
}
