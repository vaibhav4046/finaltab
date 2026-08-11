import { z } from "zod";
import { getAddress } from "viem";
import { authenticatedUser } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { makeWalletChallenge, WALLET_CHALLENGE_TTL_MS } from "@/lib/server/walletChallenge";
import { invalidBody, readCloudJson, rejectCrossOriginMutation } from "@/lib/server/tabCollaboration";

const Body = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const { configured, user } = await authenticatedUser();
  if (!configured) return Response.json({ error: "CLOUD_NOT_CONFIGURED" }, { status: 501 });
  if (!user) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await readCloudJson(request));
  } catch (error) {
    return invalidBody(error);
  }

  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "CLOUD_ADMIN_NOT_CONFIGURED" }, { status: 501 });

  const address = getAddress(parsed.address).toLowerCase() as `0x${string}`;
  const expiresAt = new Date(Date.now() + WALLET_CHALLENGE_TTL_MS);
  const { message } = makeWalletChallenge({
    origin: new URL(request.url).origin,
    userId: user.id,
    address,
    expiresAt,
  });

  const { data, error } = await admin
    .from("wallet_challenges")
    .insert({ user_id: user.id, address, message, expires_at: expiresAt.toISOString() })
    .select("id")
    .single();

  if (error || !data) {
    return Response.json({ error: "CHALLENGE_CREATE_FAILED" }, { status: 503 });
  }
  return Response.json(
    { challengeId: data.id, message, address, expiresAt: expiresAt.toISOString() },
    { headers: { "cache-control": "private, no-store" } },
  );
}
