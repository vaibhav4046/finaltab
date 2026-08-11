import { z } from "zod";
import {
  ApiPayloadTooLargeError,
  authorizeApiRequest,
  readJsonBodyWithLimit,
  withAccessHeaders,
} from "@/lib/server/apiAccess";
import { jsonError } from "@/lib/server/clients";
import { createBroadcastApprovalChallenge } from "@/lib/server/mcpSettlement";
import { requiredV2SettlementContract } from "@/lib/server/settlement";

export const runtime = "nodejs";

const ChallengeRequestSchema = z.object({
  settlementId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  ledgerHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  approver: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  ttlSeconds: z.number().int().min(60).max(900).optional(),
}).strict();

const MAX_CHALLENGE_BYTES = 8_192;

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeApiRequest(request, {
    scope: "settlements:submit",
    // A same-origin cookie session additionally proves control of a debtor
    // wallet below. Bearer clients must still carry settlements:submit.
    sessionFallbackScope: "settlements:prepare",
    maxBytes: MAX_CHALLENGE_BYTES,
    rateLimit: 8,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);

  try {
    const body = ChallengeRequestSchema.parse(await readJsonBodyWithLimit(request, MAX_CHALLENGE_BYTES));
    const contractAddress = requiredV2SettlementContract();
    const challenge = createBroadcastApprovalChallenge({
      principalSubject: access.principal.subject,
      approver: body.approver,
      contractAddress,
      settlementId: body.settlementId,
      ledgerHash: body.ledgerHash,
      ttlSeconds: body.ttlSeconds,
    });
    return secured(Response.json({
      ...challenge,
      signingMethod: "personal_sign / EIP-191",
      retryPolicy:
        "This exact-plan approval may be retried until expiry. KeeperHub idempotency and V2 settlement state prevent duplicate settlement.",
    }));
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) {
      return secured(Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes: error.maxBytes }, { status: 413 }));
    }
    const message = error instanceof Error ? error.message : "invalid approval challenge request";
    const status = /FINALTAB_SETTLEMENT_CONTRACT_VERSION|contract address is not configured/.test(message) ? 501 : 400;
    return secured(jsonError(message, status));
  }
}
