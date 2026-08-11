import {
  buildFinalTabOpenApi,
  canonicalIntegrationOrigin,
} from "@/lib/integrations/keeperhubDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const origin = canonicalIntegrationOrigin(request.url, process.env.FINALTAB_APP_ORIGIN);
  return Response.json(buildFinalTabOpenApi(origin), {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
