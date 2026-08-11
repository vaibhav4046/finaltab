import { afterEach, describe, expect, it } from "vitest";
import {
  ApiPayloadTooLargeError,
  apiAccessInternals,
  readJsonBodyWithLimit,
  type ApiPrincipal,
} from "@/lib/server/apiAccess";

const original = process.env.FINALTAB_API_TOKENS_JSON;

afterEach(() => {
  if (original === undefined) delete process.env.FINALTAB_API_TOKENS_JSON;
  else process.env.FINALTAB_API_TOKENS_JSON = original;
});

describe("scoped API tokens", () => {
  it("matches only the configured SHA-256 and returns no raw secret", () => {
    const raw = "ft_live_this_is_a_long_random_test_token";
    const digest = apiAccessInternals.sha256(raw);
    process.env.FINALTAB_API_TOKENS_JSON = JSON.stringify([
      {
        name: "mcp test",
        subject: "user-1",
        tokenSha256: digest,
        scopes: ["settlements:read", "settlements:submit"],
      },
    ]);

    const principal = apiAccessInternals.tokenPrincipal(raw);
    expect(principal?.subject).toBe("user-1");
    expect(principal?.scopes.has("settlements:submit")).toBe(true);
    expect(JSON.stringify(principal)).not.toContain(raw);
    expect(apiAccessInternals.tokenPrincipal(`${raw}x`)).toBeNull();
  });

  it("drops unknown scopes and malformed entries", () => {
    process.env.FINALTAB_API_TOKENS_JSON = JSON.stringify([
      { name: "bad", subject: "x", tokenSha256: "nope", scopes: ["settlements:submit"] },
      {
        name: "limited",
        subject: "x",
        tokenSha256: "a".repeat(64),
        scopes: ["settlements:read", "admin:everything"],
      },
    ]);
    const configs = apiAccessInternals.configuredTokens();
    expect(configs).toHaveLength(1);
    expect(configs[0]?.scopes).toEqual(["settlements:read"]);
  });
});

describe("Supabase session scope defaults", () => {
  it("never grants value-moving submission when scope metadata is absent", () => {
    const scopes = apiAccessInternals.scopesFromAppMetadata(undefined);

    expect([...scopes].sort()).toEqual([
      "receipts:write",
      "settlements:prepare",
      "settlements:read",
      "tabs:read",
      "tabs:write",
    ]);
    expect(scopes.has("settlements:submit")).toBe(false);
  });

  it("fails closed for malformed metadata and honors only explicit known scopes", () => {
    expect(apiAccessInternals.scopesFromAppMetadata({ finaltab_scopes: "settlements:submit" }).size).toBe(0);
    expect([...apiAccessInternals.scopesFromAppMetadata({
      finaltab_scopes: ["settlements:read", "settlements:submit", "admin:all"],
    })]).toEqual(["settlements:read", "settlements:submit"]);
  });

  it("allows the exact-wallet-approval fallback only for cookie sessions, never bearer credentials", () => {
    const base = {
      subject: "user-1",
      name: "User",
      scopes: new Set(["settlements:prepare"] as const),
      rateKey: "rate-key",
    };
    const options = {
      scope: "settlements:submit" as const,
      sessionFallbackScope: "settlements:prepare" as const,
    };
    const session: ApiPrincipal = { ...base, source: "session" };
    const bearerJwt: ApiPrincipal = { ...base, source: "bearer-jwt" };
    const bearerToken: ApiPrincipal = { ...base, source: "bearer-token" };

    expect(apiAccessInternals.principalHasRequiredScope(session, options)).toBe(true);
    expect(apiAccessInternals.principalHasRequiredScope(bearerJwt, options)).toBe(false);
    expect(apiAccessInternals.principalHasRequiredScope(bearerToken, options)).toBe(false);
  });
});

describe("bounded JSON bodies", () => {
  it("parses a body below the byte limit", async () => {
    const request = new Request("https://finaltab.test/api", {
      method: "POST",
      body: JSON.stringify({ exact: "plan" }),
    });

    await expect(readJsonBodyWithLimit(request, 100)).resolves.toEqual({ exact: "plan" });
  });

  it("rejects streamed bytes beyond the limit even without Content-Length", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"payload":"'));
        controller.enqueue(encoder.encode("x".repeat(64)));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      },
    });
    const request = new Request("https://finaltab.test/api", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readJsonBodyWithLimit(request, 32)).rejects.toBeInstanceOf(ApiPayloadTooLargeError);
  });

  it("rejects an oversized declared body before reading", async () => {
    const request = new Request("https://finaltab.test/api", {
      method: "POST",
      headers: { "content-length": "999" },
      body: "{}",
    });

    await expect(readJsonBodyWithLimit(request, 32)).rejects.toBeInstanceOf(ApiPayloadTooLargeError);
  });
});
