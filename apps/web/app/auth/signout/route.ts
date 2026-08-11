import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const client = await createServerSupabaseClient();
  if (client) await client.auth.signOut({ scope: "local" });
  const response = NextResponse.redirect(new URL("/auth", request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
