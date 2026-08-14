import { classifyExecution, KeeperHubError } from "@finaltab/keeperhub";
import { ApiPayloadTooLargeError, authorizeApiRequest, readJsonBodyWithLimit, withAccessHeaders } from "@/lib/server/apiAccess";
import { keeperHubClient, keeperHubDetail } from "@/lib/server/clients";
import { verifyExecutionOnchain } from "@/lib/server/onchainProof";
import {
  SettlementFlowStatusSchema,
  getDurableSettlementFlow,
  persistTerminalStatus,
  promoteDurableSettlementProof,
} from "@/lib/server/settlementFlow";
import { invalidBody, privateJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  assertDurableSettlementObservationAccess,
  persistDurableSettlementObservation,
} from "@/lib/server/settlementSubmission";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_STATUS_BYTES = 8_192;

export async function POST(request: Request): Promise<Response> {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const access = await authorizeApiRequest(request, {
    scope: "settlements:read",
    maxBytes: MAX_STATUS_BYTES,
    rateLimit: 90,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);
  const auth = await requireCloudUser();
  if (!auth.ok) return secured(auth.response);
  if (access.principal.subject !== auth.user.id) return secured(privateJson({ ok: false, error: "PRINCIPAL_MISMATCH" }, { status: 403 }));
  try {
    const input = SettlementFlowStatusSchema.parse(await readJsonBodyWithLimit(request, MAX_STATUS_BYTES));
    const flow = await getDurableSettlementFlow(auth.client, input.flowId);
    if (!flow || !flow.internal.execution_id) {
      return secured(privateJson({ ok: false, error: "FLOW_NOT_FOUND" }, { status: 404 }));
    }
    if (["verified_settled", "failed"].includes(flow.internal.state)) {
      const verdict = flow.internal.state === "verified_settled"
        ? { verdict: "VERIFIED_SETTLED" as const, receipts: [] }
        : flow.internal.state === "failed"
          ? { verdict: "FAILED" as const, reason: "Persisted terminal provider failure.", receipts: [] }
          : { verdict: "UNPROVEN" as const, reason: "Persisted terminal state lacks exact verified proof.", receipts: [] };
      return secured(privateJson({ ok: true, idempotent: true, status: flow.internal.keeperhub_status, verdict, independent: flow.internal.independent_proof, pollHintMs: 0, flow: flow.public }));
    }
    if (!["submitted", "completed_unverified", "timeout"].includes(flow.internal.state)) {
      return secured(privateJson({ ok: false, error: "FLOW_NOT_SUBMITTED" }, { status: 409 }));
    }
    const mutationClient = createAdminSupabaseClient();
    if (!mutationClient) {
      return secured(privateJson({ ok: false, error: "SETTLEMENT_PERSISTENCE_NOT_CONFIGURED", message: "Server-side settlement persistence is unavailable." }, { status: 503 }));
    }
    await assertDurableSettlementObservationAccess({
      executionId: flow.internal.execution_id,
      principalSubject: auth.user.id,
      contractAddress: flow.internal.contract_address as `0x${string}`,
      settlementId: flow.internal.plan_hash as `0x${string}`,
      ledgerHash: flow.internal.ledger_hash as `0x${string}`,
    });
    const { client, blockedReason } = keeperHubClient();
    if (!client) return secured(privateJson({ ok: false, error: "KEEPERHUB_NOT_CONFIGURED", message: blockedReason }, { status: 501 }));
    const observed = await client.getStatus(flow.internal.execution_id);
    const keeperHubVerdict = classifyExecution(observed.body);
    const independent = keeperHubVerdict.verdict === "VERIFIED_SETTLED"
      ? await verifyExecutionOnchain(observed.body, {
          contractAddress: flow.internal.contract_address as `0x${string}`,
          settlementId: flow.internal.plan_hash as `0x${string}`,
          ledgerHash: flow.internal.ledger_hash as `0x${string}`,
        })
      : null;
    const verdict = keeperHubVerdict.verdict === "VERIFIED_SETTLED" && independent?.verified !== true
      ? { verdict: "UNPROVEN" as const, reason: "KeeperHub receipt passed, but independent RPC verification did not.", receipts: keeperHubVerdict.receipts }
      : keeperHubVerdict;
    const durability = await persistDurableSettlementObservation({
      executionId: flow.internal.execution_id,
      principalSubject: auth.user.id,
      contractAddress: flow.internal.contract_address as `0x${string}`,
      settlementId: flow.internal.plan_hash as `0x${string}`,
      ledgerHash: flow.internal.ledger_hash as `0x${string}`,
      status: observed.body,
      verdict,
      independent,
    });
    if (verdict.verdict === "PENDING") {
      return secured(privateJson({ ok: true, status: observed.body, verdict, keeperHubVerdict, independent, pollHintMs: observed.pollHintMs, durability, flow: flow.public }));
    }
    if (["completed_unverified", "timeout"].includes(flow.internal.state)) {
      if (verdict.verdict === "VERIFIED_SETTLED" && independent?.verified === true) {
        const promoted = await promoteDurableSettlementProof({
          client: auth.client,
          mutationClient,
          userId: auth.user.id,
          flow,
          status: observed.body,
          verdict,
          independent,
        });
        return secured(privateJson({ ok: true, reconciled: true, status: observed.body, verdict, keeperHubVerdict, independent, pollHintMs: 0, durability, flow: promoted }));
      }
      return secured(privateJson({ ok: true, reconciled: false, status: observed.body, verdict, keeperHubVerdict, independent, pollHintMs: observed.pollHintMs, durability, flow: flow.public }));
    }
    const committed = await persistTerminalStatus({
      client: auth.client,
      mutationClient,
      userId: auth.user.id,
      flow,
      status: observed.body,
      verdict,
      independent,
    });
    return secured(privateJson({ ok: true, status: observed.body, verdict, keeperHubVerdict, independent, pollHintMs: 0, durability, flow: committed }));
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) return secured(invalidBody(error));
    if (error instanceof KeeperHubError) return secured(privateJson({ ok: false, error: "KEEPERHUB_ERROR", message: `KeeperHub ${error.httpStatus}: ${keeperHubDetail(error)}` }, { status: 502 }));
    const message = error instanceof Error ? error.message : "Status fetch failed.";
    const status = /MISMATCH|TRANSITION|ATTESTATION|NOT_SUBMITTED/.test(message) ? 409 : 502;
    return secured(privateJson({ ok: false, error: "FLOW_STATUS_REJECTED", message }, { status }));
  }
}
