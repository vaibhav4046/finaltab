import { keeperHubClient, jsonError } from "@/lib/server/clients";
import { SettleBodySchema, settleContractCall, settlementContractAddress } from "@/lib/server/settlement";
import { SimulationRevertError, KeeperHubError, deriveIdempotencyKey } from "@finaltab/keeperhub";
import { BASE_SEPOLIA_CHAIN_ID } from "@finaltab/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const { client, blockedReason } = keeperHubClient();
  if (!client) return jsonError(blockedReason!, 501);

  const contractAddress = settlementContractAddress();
  if (!contractAddress) {
    return jsonError("NEXT_PUBLIC_SETTLEMENT_CONTRACT is not configured — the settlement contract has not been deployed yet.", 501);
  }

  let body;
  try {
    body = SettleBodySchema.parse(await req.json());
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "invalid request body", 400);
  }

  const call = settleContractCall(body, contractAddress);

  try {
    // SIMULATE FIRST, ALWAYS. A revert here means we never broadcast.
    await client.simulateContractCall(call);
  } catch (e) {
    if (e instanceof SimulationRevertError) {
      return Response.json({ ok: false, wouldRevert: true, detail: e.detail, message: e.message }, { status: 409 });
    }
    if (e instanceof KeeperHubError) {
      return jsonError(`KeeperHub simulation ${e.httpStatus}: ${e.message}`, 502);
    }
    return jsonError(e instanceof Error ? e.message : "pre-execute simulation failed", 502);
  }

  // Idempotency binds to the settlement identity: replays of the same frozen
  // ledger dedupe instead of double-broadcasting.
  const idempotencyKey = deriveIdempotencyKey({
    taskId: call.taskId!,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    recipientAddress: contractAddress,
    amount: "0",
    tokenAddress: body.settlementId,
  });

  try {
    const accepted = await client.executeContractCall(call, idempotencyKey);
    return Response.json({ ok: true, accepted });
  } catch (e) {
    if (e instanceof KeeperHubError) {
      return jsonError(`KeeperHub execute ${e.httpStatus}: ${e.message}`, 502);
    }
    return jsonError(e instanceof Error ? e.message : "execute failed", 502);
  }
}
