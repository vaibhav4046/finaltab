import "server-only";

import { classifyExecution, type ExecutionStatusResponse } from "@finaltab/keeperhub";
import {
  verifyExecutionOnchain,
  type IndependentExecutionProof,
  type ExpectedSettlementProof,
} from "@/lib/server/onchainProof";

export interface KeeperHubStatusReader {
  getStatus(executionId: string): Promise<{
    body: ExecutionStatusResponse;
    pollHintMs: number | null;
  }>;
}

export interface KeeperHubObservation {
  event: "keeperhub.execution.observe";
  executionId: string;
  expected: ExpectedSettlementProof;
  observedAt: string;
  terminal: boolean;
  status: ExecutionStatusResponse;
  keeperHubVerdict: ReturnType<typeof classifyExecution>;
  independent: IndependentExecutionProof | null;
  verdict: ReturnType<typeof classifyExecution>;
  pollHintMs: number | null;
  trustModel: "callback-is-a-wakeup-signal; status-is-refetched; verified-success-is-chain-checked";
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/**
 * Never trusts event payload claims. The only input retained from the callback
 * is the opaque execution id; status comes from KeeperHub and successful proof
 * is independently re-fetched from Base Sepolia.
 */
export async function observeKeeperHubExecution(
  client: KeeperHubStatusReader,
  executionId: string,
  expected: ExpectedSettlementProof,
  verifyOnchain: (
    status: ExecutionStatusResponse,
    expected: ExpectedSettlementProof,
  ) => Promise<IndependentExecutionProof> = verifyExecutionOnchain,
  now: () => Date = () => new Date(),
): Promise<KeeperHubObservation> {
  const { body, pollHintMs } = await client.getStatus(executionId);
  const keeperHubVerdict = classifyExecution(body);
  const independent = keeperHubVerdict.verdict === "VERIFIED_SETTLED"
    ? await verifyOnchain(body, expected)
    : null;
  const verdict =
    keeperHubVerdict.verdict === "VERIFIED_SETTLED" && independent?.verified !== true
      ? {
          verdict: "UNPROVEN" as const,
          reason: "KeeperHub receipt passed, but independent Base Sepolia verification did not.",
          receipts: keeperHubVerdict.receipts,
        }
      : keeperHubVerdict;

  return {
    event: "keeperhub.execution.observe",
    executionId,
    expected,
    observedAt: now().toISOString(),
    terminal: TERMINAL.has(body.status) || pollHintMs === 0,
    status: body,
    keeperHubVerdict,
    independent,
    verdict,
    pollHintMs,
    trustModel: "callback-is-a-wakeup-signal; status-is-refetched; verified-success-is-chain-checked",
  };
}
