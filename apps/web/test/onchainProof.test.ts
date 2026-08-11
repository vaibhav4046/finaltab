import { afterEach, describe, expect, it, vi } from "vitest";
import { keccak256, toHex } from "viem";
import { verifyExecutionOnchain } from "../lib/server/onchainProof";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const HASH = `0x${"ab".repeat(32)}`;
const SETTLEMENT_ID = `0x${"11".repeat(32)}` as const;
const LEDGER_HASH = `0x${"22".repeat(32)}` as const;
const EVENT_TOPIC = keccak256(toHex("SettlementExecuted(bytes32,bytes32,uint256,uint256,uint256)"));

function rpcFetch(topics: string[]) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { method: string };
    const result = request.method === "eth_blockNumber"
      ? "0x64"
      : {
          transactionHash: HASH,
          blockNumber: "0x64",
          status: "0x1",
          logs: [{ address: CONTRACT, topics }],
        };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("independent V2 onchain proof", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requires a successful independently fetched receipt with the V2 event", async () => {
    vi.stubEnv("NEXT_PUBLIC_SETTLEMENT_CONTRACT", CONTRACT);
    vi.stubGlobal("fetch", rpcFetch([EVENT_TOPIC, SETTLEMENT_ID, LEDGER_HASH]));
    const proof = await verifyExecutionOnchain({
      executionId: "execution-1",
      status: "completed",
      receipts: [{
        hash: HASH,
        chainId: 84532,
        verified: true,
        receiptStatus: "success",
        blockNumber: 100,
      }],
    }, { contractAddress: CONTRACT, settlementId: SETTLEMENT_ID, ledgerHash: LEDGER_HASH });
    expect(proof.verified).toBe(true);
    expect(proof.receipts[0]).toMatchObject({
      verified: true,
      confirmations: 1,
      contractLogFound: true,
      settlementBindingFound: true,
      observedSettlementId: SETTLEMENT_ID,
      observedLedgerHash: LEDGER_HASH,
    });
  });

  it("fails closed when the V2 SettlementExecuted topic is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SETTLEMENT_CONTRACT", CONTRACT);
    vi.stubGlobal("fetch", rpcFetch([`0x${"00".repeat(32)}`]));
    const proof = await verifyExecutionOnchain({
      executionId: "execution-2",
      status: "completed",
      receipts: [{
        hash: HASH,
        chainId: 84532,
        verified: true,
        receiptStatus: "success",
        blockNumber: 100,
      }],
    }, { contractAddress: CONTRACT, settlementId: SETTLEMENT_ID, ledgerHash: LEDGER_HASH });
    expect(proof.verified).toBe(false);
    expect(proof.receipts[0]?.reason).toMatch(/V2 SettlementExecuted event is absent/);
  });

  it("fails closed when a real V2 event belongs to another frozen plan", async () => {
    vi.stubEnv("NEXT_PUBLIC_SETTLEMENT_CONTRACT", CONTRACT);
    vi.stubGlobal("fetch", rpcFetch([EVENT_TOPIC, `0x${"33".repeat(32)}`, LEDGER_HASH]));
    const proof = await verifyExecutionOnchain({
      executionId: "execution-3",
      status: "completed",
      receipts: [{
        hash: HASH,
        chainId: 84532,
        verified: true,
        receiptStatus: "success",
        blockNumber: 100,
      }],
    }, { contractAddress: CONTRACT, settlementId: SETTLEMENT_ID, ledgerHash: LEDGER_HASH });
    expect(proof.verified).toBe(false);
    expect(proof.receipts[0]).toMatchObject({
      contractLogFound: true,
      settlementBindingFound: false,
    });
    expect(proof.receipts[0]?.reason).toMatch(/different frozen plan/);
  });

  it("never emits a green proof without an expected settlement binding", async () => {
    vi.stubEnv("NEXT_PUBLIC_SETTLEMENT_CONTRACT", CONTRACT);
    vi.stubGlobal("fetch", rpcFetch([EVENT_TOPIC, SETTLEMENT_ID, LEDGER_HASH]));
    const proof = await verifyExecutionOnchain({
      executionId: "execution-4",
      status: "completed",
      receipts: [{
        hash: HASH,
        chainId: 84532,
        verified: true,
        receiptStatus: "success",
        blockNumber: 100,
      }],
    });
    expect(proof.verified).toBe(false);
    expect(proof.receipts[0]?.reason).toMatch(/were not supplied/);
  });
});
