import { z } from "zod";
import { listSettlementAgentMemory } from "@/lib/server/agentControl";
import { invalidBody, privateJson, requireCloudUser } from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OptionalTabId = z.string().uuid().optional();

export async function GET(request: Request) {
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const tabResult = OptionalTabId.safeParse(new URL(request.url).searchParams.get("tabId") ?? undefined);
  if (!tabResult.success) return invalidBody(tabResult.error);
  try {
    return privateJson({ ok: true, memory: await listSettlementAgentMemory(auth.client, tabResult.data) });
  } catch (error) {
    return privateJson(
      { ok: false, error: "AGENT_MEMORY_READ_FAILED", message: error instanceof Error ? error.message : "Memory read failed." },
      { status: 503 },
    );
  }
}
