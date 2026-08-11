import { authenticatedUser } from "@/lib/supabase/server";
import { privyServerConfig, verifyPrivyIdentityBridge } from "@/lib/privy/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, Cookie, Origin, privy-id-token",
};

function authError(code: string, status: number): Response {
  return Response.json(
    { ok: false, error: code },
    {
      status,
      headers: {
        ...PRIVATE_HEADERS,
        ...(status === 401
          ? { "www-authenticate": 'Bearer realm="finaltab-privy"' }
          : {}),
      },
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  const config = privyServerConfig();
  if (!config) return authError("PRIVY_NOT_CONFIGURED", 503);

  const { configured, user } = await authenticatedUser();
  if (!configured) return authError("SUPABASE_NOT_CONFIGURED", 503);
  if (!user) return authError("SUPABASE_SESSION_REQUIRED", 401);

  const result = await verifyPrivyIdentityBridge(request, user.id, config);
  if (!result.ok) {
    const status = result.code === "ORIGIN_REJECTED"
      || result.code === "IDENTITY_BRIDGE_MISMATCH"
      ? 403
      : result.code === "PRIVY_NOT_CONFIGURED"
        ? 503
        : 401;
    return authError(result.code, status);
  }

  return Response.json(
    {
      ok: true,
      authenticated: true,
      identity: result.identity,
    },
    { headers: PRIVATE_HEADERS },
  );
}
