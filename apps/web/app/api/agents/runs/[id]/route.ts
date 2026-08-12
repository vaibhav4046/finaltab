import { z } from "zod";
import type { SettlementLineageFlow } from "@/lib/agentControl";
import { getSettlementAgentRun } from "@/lib/server/agentControl";
import { getDurableSettlementFlowByRun } from "@/lib/server/settlementFlow";
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
    // The settlement half of the lineage is optional evidence. A run that was
    // never frozen has no flow, and a flow that fails its attestation check is
    // returned as null by the reader, so `flow: null` means "not proven" rather
    // than "failed". A read that throws is reported as a reason instead of
    // being flattened into absence.
    let flow: SettlementLineageFlow | null = null;
    let flowIssue: string | null = null;
    try {
      const durable = await getDurableSettlementFlowByRun(auth.client, id.data);
      flow = durable?.public ?? null;
    } catch (error) {
      flowIssue = error instanceof Error ? error.message : "Settlement flow evidence could not be read.";
    }
    return privateJson({ ok: true, run, flow, flowIssue });
  } catch (error) {
    return privateJson(
      { ok: false, error: "AGENT_RUN_READ_FAILED", message: error instanceof Error ? error.message : "Run read failed." },
      { status: 503 },
    );
  }
}
