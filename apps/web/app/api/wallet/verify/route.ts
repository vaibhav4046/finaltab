import { z } from "zod";
import { verifyMessage } from "viem";
import { authenticatedUser } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/server/walletChallenge";
import { invalidBody, readCloudJson, rejectCrossOriginMutation } from "@/lib/server/tabCollaboration";

const Body = z.object({
  challengeId: z.string().uuid(),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

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

  const { data: challenge, error: lookupError } = await admin
    .from("wallet_challenges")
    .select("id,user_id,address,message,expires_at,consumed_at")
    .eq("id", parsed.challengeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError || !challenge) {
    return Response.json({ error: "CHALLENGE_NOT_FOUND" }, { status: 404 });
  }
  if (challenge.consumed_at) {
    return Response.json({ error: "CHALLENGE_ALREADY_USED" }, { status: 409 });
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return Response.json({ error: "CHALLENGE_EXPIRED" }, { status: 410 });
  }

  const valid = await verifyMessage({
    address: challenge.address as `0x${string}`,
    message: challenge.message,
    signature: parsed.signature as `0x${string}`,
  });
  if (!valid) return Response.json({ error: "SIGNATURE_INVALID" }, { status: 403 });

  const consumedAt = new Date().toISOString();
  const { data: consumed, error: consumeError } = await admin
    .from("wallet_challenges")
    .update({ consumed_at: consumedAt })
    .eq("id", challenge.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumeError || !consumed) {
    return Response.json({ error: "CHALLENGE_ALREADY_USED" }, { status: 409 });
  }

  await admin.from("wallet_accounts").update({ is_primary: false }).eq("user_id", user.id);
  const { error: walletError } = await admin.from("wallet_accounts").upsert(
    {
      user_id: user.id,
      address: challenge.address,
      chain_id: BASE_SEPOLIA_CHAIN_ID,
      is_primary: true,
      verified_at: consumedAt,
    },
    { onConflict: "user_id,address" },
  );
  if (walletError) return Response.json({ error: "WALLET_LINK_FAILED" }, { status: 503 });

  return Response.json(
    { verified: true, address: challenge.address, chainId: BASE_SEPOLIA_CHAIN_ID },
    { headers: { "cache-control": "private, no-store" } },
  );
}
