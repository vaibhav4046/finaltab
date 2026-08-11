import { z } from "zod";
import {
  invalidBody,
  privateJson,
  rejectCrossOriginMutation,
  requireCloudUser,
} from "@/lib/server/tabCollaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MemoryId = z.string().uuid();

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;
  const id = MemoryId.safeParse((await context.params).id);
  if (!id.success) return invalidBody(id.error);
  const { data, error } = await auth.client
    .from("settlement_agent_memory")
    .delete()
    .eq("id", id.data)
    .select("id")
    .maybeSingle();
  if (error) {
    return privateJson({ ok: false, error: "MEMORY_DELETE_FAILED", message: error.message }, { status: 503 });
  }
  if (!data) {
    return privateJson(
      { ok: false, error: "MEMORY_NOT_FOUND", message: "Memory was not found or cannot be deleted by this account." },
      { status: 404 },
    );
  }
  return privateJson({ ok: true, deletedId: data.id });
}
