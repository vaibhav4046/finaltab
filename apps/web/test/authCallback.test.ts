import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth })),
}));

import { GET } from "@/app/auth/callback/route";

const originalOrigin = process.env.FINALTAB_APP_ORIGIN;

beforeEach(() => {
  process.env.FINALTAB_APP_ORIGIN = "https://finaltab.example";
  auth.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  if (originalOrigin === undefined) delete process.env.FINALTAB_APP_ORIGIN;
  else process.env.FINALTAB_APP_ORIGIN = originalOrigin;
});

describe("Supabase PKCE callback", () => {
  it("exchanges one code against its strictly validated per-flow verifier", async () => {
    const response = await GET(new Request(
      "https://internal.invalid/auth/callback?code=one-use&sb_flow_id=0123456789abcdef0123456789abcdef&next=%2Fapp%2Ftab%3Fd%3D1",
    ));

    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "one-use",
      { flowId: "0123456789abcdef0123456789abcdef" },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://finaltab.example/auth/complete?next=%2Fapp%2Ftab%3Fd%3D1",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("maps provider errors to one stable code without reflecting descriptions", async () => {
    const response = await GET(new Request(
      "https://internal.invalid/auth/callback?error_description=private-provider-detail&next=https%3A%2F%2Fattacker.example",
    ));

    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://finaltab.example/auth?error=oauth-provider-error&next=%2Fapp",
    );
    expect(response.headers.get("location")).not.toContain("private-provider-detail");
  });

  it("maps an SDK or network rejection to a stable local error", async () => {
    auth.exchangeCodeForSession.mockRejectedValueOnce(new Error("private network detail"));
    const response = await GET(new Request(
      "https://internal.invalid/auth/callback?code=one-use&sb_flow_id=0123456789abcdef0123456789abcdef",
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://finaltab.example/auth?error=invalid-or-expired-link&next=%2Fapp",
    );
    expect(response.headers.get("location")).not.toContain("network");
  });

  it.each([
    "code=one-use",
    "code=first&code=second",
    "code=one-use&sb_flow_id=short",
    "code=one-use&sb_flow_id=0123456789abcdef&sb_flow_id=fedcba9876543210",
    "code=one-use&next=%2Fapp&next=%2Fjoin",
    "code=one-use&token_hash=also-present&type=email",
  ])("rejects ambiguous callback input: %s", async (query) => {
    const response = await GET(new Request(`https://internal.invalid/auth/callback?${query}`));

    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://finaltab.example/auth?error=missing-or-ambiguous-code&next=%2Fapp",
    );
  });
});
