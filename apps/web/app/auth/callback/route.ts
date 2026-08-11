import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const client = await createServerSupabaseClient();

  if (!client) {
    return NextResponse.redirect(new URL("/auth?error=cloud-not-configured", url.origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/auth?error=missing-code", url.origin));
  }

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/auth?error=invalid-or-expired-link", url.origin));
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
