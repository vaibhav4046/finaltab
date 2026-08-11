import { keeperHubClient, jsonError } from "@/lib/server/clients";
import { classifyExecution, KeeperHubError } from "@finaltab/keeperhub";
import { verifyExecutionOnchain } from "@/lib/server/onchainProof";
import { authorizeApiRequest, withAccessHeaders } from "@/lib/server/apiAccess";
import { requiredV2SettlementContract } from "@/lib/server/settlement";
import { verifyProofCapability } from "@/lib/server/proofCapability";

export const runtime = "nodejs";
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(id)) return jsonError("invalid execution id", 400);
  const url = new URL(req.url);
  const settlementId = url.searchParams.get("settlementId");
  const ledgerHash = url.searchParams.get("ledgerHash");
  if (!settlementId || !ledgerHash || !BYTES32_RE.test(settlementId) || !BYTES32_RE.test(ledgerHash)) {
    return jsonError(
      "settlementId and ledgerHash are required so an unrelated successful execution can never substitute for this frozen plan.",
      400,
    );
  }

  let contractAddress: `0x${string}`;
  try {
    contractAddress = requiredV2SettlementContract();
  } catch {
    return jsonError(
      "V2 proof verification is unavailable because this deployment has no approved V2 contract configuration.",
      503,
    );
  }

  const proofToken = req.headers.get("x-finaltab-proof-capability") ?? "";
  const capabilityAccess = verifyProofCapability(proofToken, {
    executionId: id,
    contractAddress,
    settlementId: settlementId as `0x${string}`,
    ledgerHash: ledgerHash as `0x${string}`,
  });
  let secured: (response: Response) => Response;
  if (capabilityAccess) {
    const capabilityHeaders = new Headers({
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    });
    secured = (response) => withAccessHeaders(response, capabilityHeaders);
  } else {
    const access = await authorizeApiRequest(req, {
      scope: "settlements:read",
      maxBytes: 0,
      rateLimit: 90,
      rateWindowMs: 60_000,
      requireSameOriginForSession: false,
    });
    if (!access.ok) return access.response;
    secured = (response) => withAccessHeaders(response, access.headers);
  }

  const { client, blockedReason } = keeperHubClient();
  if (!client) return secured(jsonError(blockedReason!, 501));

  try {
    const { body, pollHintMs } = await client.getStatus(id);
    // Verdict is computed server-side with the same fail-closed rules as the
    // flight recorder: VERIFIED_SETTLED needs verified receipts, not a hash.
    const verdict = classifyExecution(body);
    const independent = verdict.verdict === "VERIFIED_SETTLED"
      ? await verifyExecutionOnchain(body, {
          contractAddress,
          settlementId: settlementId as `0x${string}`,
          ledgerHash: ledgerHash as `0x${string}`,
        })
      : null;
    const finalVerdict =
      verdict.verdict === "VERIFIED_SETTLED" && independent?.verified !== true
        ? { verdict: "UNPROVEN" as const, reason: "KeeperHub receipt passed, but independent RPC verification did not.", receipts: verdict.receipts }
        : verdict;
    return secured(Response.json(
      { status: body, verdict: finalVerdict, keeperHubVerdict: verdict, independent, pollHintMs },
      { headers: { "cache-control": "private, no-store" } },
    ));
  } catch (e) {
    if (e instanceof KeeperHubError) {
      return secured(jsonError(`KeeperHub ${e.httpStatus}: ${e.message}`, 502));
    }
    return secured(jsonError(e instanceof Error ? e.message : "status fetch failed", 502));
  }
}
