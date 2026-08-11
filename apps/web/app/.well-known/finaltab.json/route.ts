import {
  buildKeeperHubDiscovery,
  canonicalIntegrationOrigin,
  publicV2ContractAddress,
} from "@/lib/integrations/keeperhubDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const origin = canonicalIntegrationOrigin(request.url, process.env.FINALTAB_APP_ORIGIN);
  const contractAddress = publicV2ContractAddress(process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT);
  return Response.json(buildKeeperHubDiscovery(origin, contractAddress), {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
