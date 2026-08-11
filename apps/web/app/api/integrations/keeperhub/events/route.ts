import { z } from "zod";
import { KeeperHubError } from "@finaltab/keeperhub";
import { ApiPayloadTooLargeError, authorizeApiRequest, readJsonBodyWithLimit, withAccessHeaders } from "@/lib/server/apiAccess";
import { keeperHubClient, keeperHubDetail, jsonError } from "@/lib/server/clients";
import { observeKeeperHubExecution } from "@/lib/server/keeperhubObserver";
import { requiredV2SettlementContract } from "@/lib/server/settlement";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z
  .object({
    event: z.literal("keeperhub.execution.observe"),
    executionId: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/),
    settlementId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    ledgerHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeApiRequest(request, {
    scope: "settlements:read",
    maxBytes: 8_192,
    rateLimit: 30,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await readJsonBodyWithLimit(request, 8_192));
  } catch (cause) {
    if (cause instanceof ApiPayloadTooLargeError) {
      return secured(Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes: cause.maxBytes }, { status: 413 }));
    }
    return secured(jsonError(cause instanceof Error ? cause.message : "invalid event body", 400));
  }

  const { client, blockedReason } = keeperHubClient();
  if (!client) return secured(jsonError(blockedReason!, 501));

  try {
    const contractAddress = requiredV2SettlementContract();
    const observation = await observeKeeperHubExecution(client, body.executionId, {
      contractAddress,
      settlementId: body.settlementId as `0x${string}`,
      ledgerHash: body.ledgerHash as `0x${string}`,
    });
    return secured(
      Response.json(observation, {
        status: observation.terminal ? 200 : 202,
        headers: { "cache-control": "private, no-store" },
      }),
    );
  } catch (cause) {
    if (cause instanceof KeeperHubError) {
      return secured(jsonError(`KeeperHub ${cause.httpStatus}: ${keeperHubDetail(cause)}`, 502));
    }
    return secured(jsonError(cause instanceof Error ? cause.message : "KeeperHub observation failed", 502));
  }
}
