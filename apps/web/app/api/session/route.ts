import { authenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { configured, user } = await authenticatedUser();
  return Response.json(
    {
      configured,
      authenticated: Boolean(user),
      walletLinkConfigured: Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
      user: user ? { id: user.id, email: user.email ?? null } : null,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
