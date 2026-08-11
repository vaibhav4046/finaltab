import { NextResponse } from "next/server";
import { canonicalAppOrigin, isSameOriginMutation } from "@/lib/auth/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { ok: false, error: "ORIGIN_REJECTED" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  const client = await createServerSupabaseClient();
  if (client) await client.auth.signOut({ scope: "local" });
  const response = NextResponse.redirect(
    new URL("/auth?status=signed-out", canonicalAppOrigin(request)),
    303,
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
