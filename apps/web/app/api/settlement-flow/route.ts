import { z } from "zod";
import { authorizeApiRequest, withAccessHeaders } from "@/lib/server/apiAccess";
import { listDurableSettlementFlows } from "@/lib/server/settlementFlow";
import { invalidBody, privateJson, requireCloudUser } from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  tabId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

export async function GET(request: Request): Promise<Response> {
  const access = await authorizeApiRequest(request, {
    scope: "tabs:read",
    maxBytes: 0,
    rateLimit: 60,
    rateWindowMs: 60_000,
    requireSameOriginForSession: false,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);
  const auth = await requireCloudUser();
  if (!auth.ok) return secured(auth.response);
  if (access.principal.subject !== auth.user.id) return secured(privateJson({ ok: false, error: "PRINCIPAL_MISMATCH" }, { status: 403 }));
  const url = new URL(request.url);
  const query = QuerySchema.safeParse({
    tabId: url.searchParams.get("tabId"),
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!query.success) return secured(invalidBody(query.error));
  try {
    const flows = await listDurableSettlementFlows(auth.client, query.data.tabId, query.data.limit);
    return secured(privateJson({ ok: true, flows }));
  } catch (error) {
    return secured(privateJson(
      { ok: false, error: "FLOW_HISTORY_UNAVAILABLE", message: error instanceof Error ? error.message : "Flow history is unavailable." },
      { status: 503 },
    ));
  }
}
