import { KeeperHubError, SimulationRevertError } from "@finaltab/keeperhub";
import { ApiPayloadTooLargeError, authorizeApiRequest, readJsonBodyWithLimit, withAccessHeaders } from "@/lib/server/apiAccess";
import { keeperHubDetail } from "@/lib/server/clients";
import {
  SimulateSettlementFlowSchema,
  assertDurableFlowContractConfigured,
  getDurableSettlementFlow,
  persistSuccessfulSimulation,
  settlementFlowInternals,
} from "@/lib/server/settlementFlow";
import { SettlementSubmissionBlockedError, simulateSignedSettlement } from "@/lib/server/settlementSubmission";
import { invalidBody, privateJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_SIMULATE_BYTES = 400_000;

export async function POST(request: Request): Promise<Response> {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const access = await authorizeApiRequest(request, {
    scope: "settlements:prepare",
    maxBytes: MAX_SIMULATE_BYTES,
    rateLimit: 12,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);
  const auth = await requireCloudUser();
  if (!auth.ok) return secured(auth.response);
  if (access.principal.subject !== auth.user.id) return secured(privateJson({ ok: false, error: "PRINCIPAL_MISMATCH" }, { status: 403 }));
  try {
    const input = SimulateSettlementFlowSchema.parse(await readJsonBodyWithLimit(request, MAX_SIMULATE_BYTES));
    const flow = await getDurableSettlementFlow(auth.client, input.flowId);
    if (!flow) {
      return secured(privateJson({ ok: false, error: "FLOW_NOT_FOUND" }, { status: 404 }));
    }
    const bodyHash = settlementFlowInternals.digest(input.signedSettlement);
    if (flow.internal.state !== "frozen") {
      if (flow.internal.signed_body_hash !== bodyHash) {
        return secured(privateJson({ ok: false, error: "FLOW_SIGNED_BODY_MISMATCH" }, { status: 409 }));
      }
      if (flow.internal.state === "simulated" && flow.internal.simulation_hash) {
        return secured(privateJson({ ok: true, idempotent: true, simulation: { success: true, wouldRevert: false, persisted: true }, flow: flow.public }));
      }
      return secured(privateJson({ ok: false, error: "FLOW_ALREADY_ADVANCED", message: "This exact simulation was persisted earlier; the flow has already advanced beyond simulation." }, { status: 409 }));
    }
    const mutationClient = createAdminSupabaseClient();
    if (!mutationClient) {
      return secured(privateJson({ ok: false, error: "SETTLEMENT_PERSISTENCE_NOT_CONFIGURED", message: "Server-side settlement persistence is unavailable." }, { status: 503 }));
    }
    assertDurableFlowContractConfigured(flow.internal);
    const simulated = await simulateSignedSettlement(input.signedSettlement);
    const committed = await persistSuccessfulSimulation({
      client: auth.client,
      mutationClient,
      userId: auth.user.id,
      flow,
      body: simulated.body,
      simulation: simulated.simulation,
    });
    return secured(privateJson({ ok: true, idempotent: false, simulation: simulated.simulation, flow: committed }));
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) return secured(invalidBody(error));
    if (error instanceof SimulationRevertError) {
      return secured(privateJson({ ok: false, wouldRevert: true, detail: error.detail, message: error.message }, { status: 409 }));
    }
    if (error instanceof SettlementSubmissionBlockedError) return secured(privateJson({ ok: false, error: "KEEPERHUB_NOT_CONFIGURED", message: error.message }, { status: 501 }));
    if (error instanceof KeeperHubError) return secured(privateJson({ ok: false, error: "KEEPERHUB_ERROR", message: `KeeperHub ${error.httpStatus}: ${keeperHubDetail(error)}` }, { status: 502 }));
    const message = error instanceof Error ? error.message : "Simulation failed.";
    const status = /MISMATCH|TRANSITION|ATTESTATION/.test(message) ? 409 : 400;
    return secured(privateJson({ ok: false, error: "FLOW_SIMULATION_REJECTED", message }, { status }));
  }
}
