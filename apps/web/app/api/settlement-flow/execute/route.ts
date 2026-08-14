import { KeeperHubError, SimulationRevertError } from "@finaltab/keeperhub";
import { ApiPayloadTooLargeError, authorizeApiRequest, readJsonBodyWithLimit, withAccessHeaders } from "@/lib/server/apiAccess";
import { keeperHubDetail } from "@/lib/server/clients";
import { issueProofCapability } from "@/lib/server/proofCapability";
import {
  ExecuteSettlementFlowSchema,
  assertDurableApprovalsImmediatelyBeforeExecution,
  getDurableSettlementFlow,
  persistAcceptedExecution,
  settlementFlowInternals,
} from "@/lib/server/settlementFlow";
import type { SignedBroadcastApproval } from "@/lib/server/mcpSettlement";
import {
  SettlementPersistenceCommitError,
  SettlementPersistenceUnavailableError,
  SettlementSubmissionBlockedError,
  submitApprovedSettlement,
} from "@/lib/server/settlementSubmission";
import { invalidBody, privateJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_EXECUTE_BYTES = 400_000;

export async function POST(request: Request): Promise<Response> {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const access = await authorizeApiRequest(request, {
    scope: "settlements:submit",
    sessionFallbackScope: "settlements:prepare",
    maxBytes: MAX_EXECUTE_BYTES,
    rateLimit: 4,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);
  const auth = await requireCloudUser();
  if (!auth.ok) return secured(auth.response);
  if (access.principal.subject !== auth.user.id) return secured(privateJson({ ok: false, error: "PRINCIPAL_MISMATCH" }, { status: 403 }));
  try {
    const input = ExecuteSettlementFlowSchema.parse(await readJsonBodyWithLimit(request, MAX_EXECUTE_BYTES));
    const flow = await getDurableSettlementFlow(auth.client, input.flowId);
    if (!flow) return secured(privateJson({ ok: false, error: "FLOW_NOT_FOUND" }, { status: 404 }));
    const bodyHash = settlementFlowInternals.digest(input.signedSettlement);
    if (["submitted", "completed_unverified", "verified_settled", "failed", "timeout"].includes(flow.internal.state)) {
      if (flow.internal.signed_body_hash !== bodyHash || !flow.internal.execution_id) {
        return secured(privateJson({ ok: false, error: "FLOW_EXECUTION_MISMATCH" }, { status: 409 }));
      }
      const proofCapability = issueProofCapability({
        executionId: flow.internal.execution_id,
        contractAddress: flow.internal.contract_address as `0x${string}`,
        settlementId: flow.internal.plan_hash as `0x${string}`,
        ledgerHash: flow.internal.ledger_hash as `0x${string}`,
      });
      return secured(privateJson({ ok: true, idempotent: true, accepted: flow.internal.execution_result, proofCapability, flow: flow.public }));
    }
    const mutationClient = createAdminSupabaseClient();
    if (!mutationClient) {
      return secured(privateJson({ ok: false, error: "SETTLEMENT_PERSISTENCE_NOT_CONFIGURED", message: "Server-side settlement persistence is unavailable." }, { status: 503 }));
    }
    const result = await submitApprovedSettlement({
      signedSettlement: input.signedSettlement,
      approval: input.approval as SignedBroadcastApproval,
      principalSubject: access.principal.subject,
      allowedApprovers: input.signedSettlement.transfers.map((transfer) => transfer.from),
      durableFlow: { flowId: flow.internal.id, actorUserId: auth.user.id },
      beforeBroadcast: () => assertDurableApprovalsImmediatelyBeforeExecution({
        mutationClient,
        userId: auth.user.id,
        flow,
        body: input.signedSettlement,
      }),
    });
    const committed = await persistAcceptedExecution({
      client: auth.client,
      mutationClient,
      userId: auth.user.id,
      flow,
      body: result.body,
      accepted: result.accepted,
    });
    return secured(privateJson({
      ok: true,
      idempotent: result.durableReplay,
      durableReplay: result.durableReplay,
      settlementId: result.body.settlementId,
      ledgerHash: result.body.ledgerHash,
      approval: result.verifiedApproval,
      simulation: { success: result.simulation.success, wouldRevert: result.simulation.wouldRevert },
      accepted: result.accepted,
      proofCapability: result.proofCapability,
      flow: committed,
    }));
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) return secured(invalidBody(error));
    if (error instanceof SimulationRevertError) return secured(privateJson({ ok: false, wouldRevert: true, detail: error.detail, message: error.message }, { status: 409 }));
    if (error instanceof SettlementSubmissionBlockedError) return secured(privateJson({ ok: false, error: "KEEPERHUB_NOT_CONFIGURED", message: error.message }, { status: 501 }));
    if (error instanceof SettlementPersistenceUnavailableError) {
      return secured(privateJson({ ok: false, error: "SETTLEMENT_PERSISTENCE_NOT_CONFIGURED", retrySafe: true, message: error.message }, { status: 503 }));
    }
    if (error instanceof SettlementPersistenceCommitError || /FLOW_EXECUTION_COMMIT_FAILED/.test(error instanceof Error ? error.message : "")) {
      return secured(privateJson({ ok: false, error: "SETTLEMENT_PERSISTENCE_RETRY_REQUIRED", retrySafe: true, message: error instanceof Error ? error.message : "Persistence repair required." }, { status: 503 }));
    }
    if (error instanceof KeeperHubError) return secured(privateJson({ ok: false, error: "KEEPERHUB_ERROR", message: `KeeperHub ${error.httpStatus}: ${keeperHubDetail(error)}` }, { status: 502 }));
    const message = error instanceof Error ? error.message : "Execute failed.";
    const status = /approval|signature|authorized/i.test(message) ? 403 : /MISMATCH|TRANSITION|ATTESTATION/.test(message) ? 409 : 400;
    return secured(privateJson({ ok: false, error: "FLOW_EXECUTION_REJECTED", message }, { status }));
  }
}
