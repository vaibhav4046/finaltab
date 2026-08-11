import { afterEach, describe, expect, it } from "vitest";
import { supabasePublicConfig } from "@/lib/supabase/config";

const original = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishable: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

afterEach(() => {
  if (original.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = original.url;
  if (original.publishable === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = original.publishable;
  if (original.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = original.anon;
});

describe("Supabase public configuration", () => {
  it("prefers the current publishable key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_current";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon";
    expect(supabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_current",
    });
  });

  it("accepts the legacy anon alias during migration", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon";
    expect(supabasePublicConfig()?.publishableKey).toBe("legacy-anon");
  });

  it("fails closed for absent keys or non-HTTPS URLs", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "key";
    expect(supabasePublicConfig()).toBeNull();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(supabasePublicConfig()).toBeNull();
  });
});
