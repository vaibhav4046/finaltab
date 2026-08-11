import { z } from "zod";
import { getSettlementAgentRun } from "@/lib/server/agentControl";
import { invalidBody, privateJson, requireCloudUser } from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RunId = z.string().uuid();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const id = RunId.safeParse((await context.params).id);
  if (!id.success) return invalidBody(id.error);
  try {
    const run = await getSettlementAgentRun(auth.client, id.data);
    if (!run) {
      return privateJson(
        { ok: false, error: "RUN_NOT_FOUND", message: "The run was not found or does not belong to this account." },
        { status: 404 },
      );
    }
    return privateJson({ ok: true, run });
  } catch (error) {
    return privateJson(
      { ok: false, error: "AGENT_RUN_READ_FAILED", message: error instanceof Error ? error.message : "Run read failed." },
      { status: 503 },
    );
  }
}
