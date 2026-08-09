import { keeperHubClient, jsonError } from "@/lib/server/clients";
import { classifyExecution, KeeperHubError } from "@finaltab/keeperhub";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { client, blockedReason } = keeperHubClient();
  if (!client) return jsonError(blockedReason!, 501);

  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(id)) return jsonError("invalid execution id", 400);

  try {
    const { body, pollHintMs } = await client.getStatus(id);
    // Verdict is computed server-side with the same fail-closed rules as the
    // flight recorder: VERIFIED_SETTLED needs verified receipts, not a hash.
    const verdict = classifyExecution(body);
    return Response.json({ status: body, verdict, pollHintMs });
  } catch (e) {
    if (e instanceof KeeperHubError) {
      return jsonError(`KeeperHub ${e.httpStatus}: ${e.message}`, 502);
    }
    return jsonError(e instanceof Error ? e.message : "status fetch failed", 502);
  }
}
