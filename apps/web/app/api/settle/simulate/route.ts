import { keeperHubClient, jsonError, keeperHubDetail } from "@/lib/server/clients";
import { SettleBodySchema, settleContractCall, settlementContractAddress } from "@/lib/server/settlement";
import { SimulationRevertError, KeeperHubError } from "@finaltab/keeperhub";

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

  try {
    const sim = await client.simulateContractCall(settleContractCall(body, contractAddress));
    return Response.json({ ok: true, simulation: sim });
  } catch (e) {
    if (e instanceof SimulationRevertError) {
      // Simulation says the transaction would revert. This is a hard stop:
      // nothing is broadcast, and the client must not offer execute.
      return Response.json({ ok: false, wouldRevert: true, detail: e.detail, message: e.message }, { status: 409 });
    }
    if (e instanceof KeeperHubError) {
      return jsonError(`KeeperHub ${e.httpStatus}: ${keeperHubDetail(e)}`, 502);
    }
    return jsonError(e instanceof Error ? e.message : "simulation failed", 502);
  }
}
