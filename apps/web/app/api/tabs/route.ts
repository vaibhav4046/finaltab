import { CreateTabSchema, databaseUnavailable, invalidBody, privateJson, readCloudJson, rejectCrossOriginMutation, requireCloudUser } from "@/lib/server/tabCollaboration";
import type { CloudTabRole, CloudTabStatus, CloudTabSummary } from "@/lib/cloudTabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TabRow {
  id: string;
  title: string;
  currency: string;
  status: CloudTabStatus;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;

  const { data: rows, error } = await auth.client
    .from("tabs")
    .select("id,title,currency,status,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return databaseUnavailable("CLOUD_HISTORY_FAILED");

  const tabs = (rows ?? []) as TabRow[];
  if (tabs.length === 0) return privateJson({ ok: true, configured: true, tabs: [] });
  const ids = tabs.map((tab) => tab.id);
  const [membersResult, participantsResult] = await Promise.all([
    auth.client
      .from("tab_members")
      .select("tab_id,role")
      .eq("user_id", auth.user.id)
      .in("tab_id", ids),
    auth.client.from("participants").select("id,tab_id").in("tab_id", ids),
  ]);
  if (membersResult.error || participantsResult.error) return databaseUnavailable("CLOUD_HISTORY_FAILED");

  const roles = new Map<string, CloudTabRole>(
    ((membersResult.data ?? []) as Array<{ tab_id: string; role: CloudTabRole }>).map((row) => [row.tab_id, row.role]),
  );
  const counts = new Map<string, number>();
  for (const participant of (participantsResult.data ?? []) as Array<{ tab_id: string }>) {
    counts.set(participant.tab_id, (counts.get(participant.tab_id) ?? 0) + 1);
  }

  const summaries: CloudTabSummary[] = tabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    currency: tab.currency,
    status: tab.status,
    role: roles.get(tab.id) ?? "member",
    participantCount: counts.get(tab.id) ?? 0,
    createdAt: tab.created_at,
    updatedAt: tab.updated_at,
  }));
  return privateJson({ ok: true, configured: true, tabs: summaries });
}

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireCloudUser();
  if (!auth.ok) return auth.response;

  let body: ReturnType<typeof CreateTabSchema.parse>;
  try {
    body = CreateTabSchema.parse(await readCloudJson(request));
  } catch (error) {
    return invalidBody(error);
  }

  const { data, error } = await auth.client
    .from("tabs")
    .insert({ title: body.title, currency: body.currency, owner_id: auth.user.id })
    .select("id,title,currency,status,created_at,updated_at")
    .single();
  if (error || !data) return databaseUnavailable("TAB_CREATE_FAILED");

  const tab: CloudTabSummary = {
    id: data.id,
    title: data.title,
    currency: data.currency,
    status: data.status as CloudTabStatus,
    role: "owner",
    participantCount: 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
  return privateJson({ ok: true, tab }, { status: 201 });
}
