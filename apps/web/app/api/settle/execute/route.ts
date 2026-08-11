import { z } from "zod";
import { BASE_SEPOLIA_CHAIN_ID } from "@finaltab/engine";
import { KeeperHubError, SimulationRevertError } from "@finaltab/keeperhub";
import {
  ApiPayloadTooLargeError,
  authorizeApiRequest,
  readJsonBodyWithLimit,
  withAccessHeaders,
} from "@/lib/server/apiAccess";
import { jsonError, keeperHubDetail } from "@/lib/server/clients";
import { SettleBodySchema } from "@/lib/server/settlement";
import type { SignedBroadcastApproval } from "@/lib/server/mcpSettlement";
import {
  SettlementSubmissionBlockedError,
  submitApprovedSettlement,
} from "@/lib/server/settlementSubmission";

export const runtime = "nodejs";
export const maxDuration = 60;

const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const SignedBroadcastApprovalSchema = z.object({
  version: z.literal(1),
  approvalId: z.string().uuid(),
  principalSubject: z.string().min(1).max(200),
  approver: Address,
  chainId: z.literal(BASE_SEPOLIA_CHAIN_ID),
  contractAddress: Address,
  settlementId: Bytes32,
  ledgerHash: Bytes32,
  issuedAt: z.string().regex(/^\d+$/),
  expiresAt: z.string().regex(/^\d+$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();
const ExecuteRequestSchema = z.object({
  signedSettlement: SettleBodySchema,
  approval: SignedBroadcastApprovalSchema,
}).strict();

const MAX_EXECUTE_BYTES = 400_000;

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeApiRequest(request, {
    scope: "settlements:submit",
    // Same-origin browser sessions authorize the money action with the
    // principal-bound EIP-191 artifact verified below. Bearer clients never get
    // this fallback and must be explicitly provisioned settlements:submit.
    sessionFallbackScope: "settlements:prepare",
    maxBytes: MAX_EXECUTE_BYTES,
    rateLimit: 4,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);

  let input: z.infer<typeof ExecuteRequestSchema>;
  try {
    input = ExecuteRequestSchema.parse(await readJsonBodyWithLimit(request, MAX_EXECUTE_BYTES));
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) {
      return secured(Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes: error.maxBytes }, { status: 413 }));
    }
    return secured(jsonError(error instanceof Error ? error.message : "invalid request body", 400));
  }

  try {
    const result = await submitApprovedSettlement({
      signedSettlement: input.signedSettlement,
      approval: input.approval as SignedBroadcastApproval,
      principalSubject: access.principal.subject,
      allowedApprovers: input.signedSettlement.transfers.map((transfer) => transfer.from),
    });
    return secured(Response.json({
      ok: true,
      v2: true,
      settlementId: result.body.settlementId,
      ledgerHash: result.body.ledgerHash,
      approval: result.verifiedApproval,
      simulation: { success: result.simulation.success, wouldRevert: result.simulation.wouldRevert },
      accepted: result.accepted,
      proofCapability: result.proofCapability,
      principal: { subject: access.principal.subject },
    }));
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
    const message = error instanceof Error ? error.message : "execute failed";
    if (/FINALTAB_SETTLEMENT_CONTRACT_VERSION|contract address is not configured/.test(message)) {
      return secured(jsonError(message, 501));
    }
    if (/approval|signature does not match|not authorized/.test(message)) {
      return secured(jsonError(message, 403));
    }
    return secured(jsonError(message, 400));
  }
}
