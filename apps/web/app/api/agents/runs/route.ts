import { z } from "zod";
import { ApiPayloadTooLargeError, readJsonBodyWithLimit } from "@/lib/server/apiAccess";
import {
  StartSettlementAgentRunSchema,
  listSettlementAgentRuns,
  runSettlementAgents,
} from "@/lib/server/agentControl";
import {
  invalidBody,
  privateJson,
  rejectCrossOriginMutation,
  requireCloudUser,
} from "@/lib/server/tabCollaboration";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_RUN_BODY_BYTES = 96 * 1024;
const OptionalTabId = z.string().uuid().optional();

function agentError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "The agent run failed.";
  if (message === "TAB_NOT_FOUND_OR_NOT_SHARED") {
    return privateJson({ ok: false, error: "TAB_NOT_FOUND", message: "The tab was not found or is not shared with this account." }, { status: 404 });
  }
  if (message.startsWith("PAYER_NOT_IN_TAB") || message.startsWith("PARTICIPANT_COUNT_OUT_OF_BOUNDS")) {
    return privateJson({ ok: false, error: "INVALID_TAB_STATE", message }, { status: 422 });
  }
  return privateJson(
    { ok: false, error: "AGENT_CONTROL_UNAVAILABLE", message },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const tabResult = OptionalTabId.safeParse(url.searchParams.get("tabId") ?? undefined);
  if (!tabResult.success) return invalidBody(tabResult.error);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "20");
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
    return privateJson({ ok: false, error: "INVALID_LIMIT", message: "limit must be an integer from 1 to 50." }, { status: 400 });
  }
  try {
    const runs = await listSettlementAgentRuns(auth.client, { tabId: tabResult.data, limit: requestedLimit });
    return privateJson({ ok: true, runs });
  } catch (error) {
    return agentError(error);
  }
}

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof StartSettlementAgentRunSchema>;
  try {
    input = StartSettlementAgentRunSchema.parse(
      await readJsonBodyWithLimit(request, MAX_RUN_BODY_BYTES),
    );
  } catch (error) {
    if (error instanceof ApiPayloadTooLargeError) {
      return privateJson(
        { ok: false, error: "PAYLOAD_TOO_LARGE", maxBytes: error.maxBytes },
        { status: 413 },
      );
    }
    return invalidBody(error);
  }

  try {
    const mutationClient = createAdminSupabaseClient();
    if (!mutationClient) {
      return privateJson({ ok: false, error: "SETTLEMENT_PERSISTENCE_NOT_CONFIGURED", message: "Server-side agent persistence is unavailable." }, { status: 503 });
    }
    const result = await runSettlementAgents({ client: auth.client, mutationClient, userId: auth.user.id, input });
    return privateJson(
      {
        ok: true,
        deduped: result.deduped,
        run: result.run,
        runUrl: `/app/agents/${encodeURIComponent(result.run.id)}`,
      },
      { status: result.deduped ? 200 : 201 },
    );
  } catch (error) {
    return agentError(error);
  }
}
