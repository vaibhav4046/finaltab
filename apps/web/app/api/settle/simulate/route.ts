import { KeeperHubError, SimulationRevertError } from "@finaltab/keeperhub";
import {
  ApiPayloadTooLargeError,
  authorizeApiRequest,
  readJsonBodyWithLimit,
  withAccessHeaders,
} from "@/lib/server/apiAccess";
import { jsonError, keeperHubDetail } from "@/lib/server/clients";
import {
  SettlementSubmissionBlockedError,
  simulateSignedSettlement,
} from "@/lib/server/settlementSubmission";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIMULATE_BYTES = 400_000;

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeApiRequest(request, {
    scope: "settlements:prepare",
    maxBytes: MAX_SIMULATE_BYTES,
    rateLimit: 12,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);

  let input: unknown;
  try {
    input = await readJsonBodyWithLimit(request, MAX_SIMULATE_BYTES);
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) {
      return secured(Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes: error.maxBytes }, { status: 413 }));
    }
    return secured(jsonError(error instanceof Error ? error.message : "invalid request body", 400));
  }

  try {
    const result = await simulateSignedSettlement(input);
    return secured(Response.json({ ok: true, v2: true, simulation: result.simulation }));
  } catch (error) {
    if (error instanceof SimulationRevertError) {
      return secured(Response.json(
        { ok: false, wouldRevert: true, detail: error.detail, message: error.message },
        { status: 409 },
      ));
    }
    if (error instanceof SettlementSubmissionBlockedError) return secured(jsonError(error.message, 501));
    if (error instanceof KeeperHubError) {
      return secured(jsonError(`KeeperHub ${error.httpStatus}: ${keeperHubDetail(error)}`, 502));
    }
    const message = error instanceof Error ? error.message : "simulation failed";
    if (/FINALTAB_SETTLEMENT_CONTRACT_VERSION|contract address is not configured/.test(message)) {
      return secured(jsonError(message, 501));
    }
    return secured(jsonError(message, 400));
  }
}
