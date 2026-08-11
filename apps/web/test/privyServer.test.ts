import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  extractPrivyTokenPair,
  verifyPrivyIdentityBridge,
  type PrivyServerConfig,
} from "@/lib/privy/server";

const APP_ID = "privy_test_app";
const PRIVY_USER_ID = "did:privy:cm123456789";
const SUPABASE_USER_ID = "6fd23c89-8b22-49a2-8901-4059383bc62c";
const OTHER_SUPABASE_USER_ID = "08ca0c50-71fd-4f53-a68c-7d3fbe4ab634";
const now = Math.floor(Date.now() / 1_000);
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const verificationKey = publicKey.export({ type: "spki", format: "pem" }).toString().trim();
const config: PrivyServerConfig = { appId: APP_ID, verificationKey };

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function jwt(payload: Record<string, unknown>): string {
  const signingInput = `${base64url({ alg: "ES256", typ: "JWT" })}.${base64url(payload)}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

function accessToken(overrides: Record<string, unknown> = {}): string {
  return jwt({
    iss: "privy.io",
    aud: APP_ID,
    sub: PRIVY_USER_ID,
    sid: "session-123",
    iat: now,
    exp: now + 3_600,
    ...overrides,
  });
}

function identityToken(
  customUserId = SUPABASE_USER_ID,
  overrides: Record<string, unknown> = {},
): string {
  return jwt({
    iss: "privy.io",
    aud: APP_ID,
    sub: PRIVY_USER_ID,
    iat: now,
    exp: now + 3_600,
    cr: String(now - 120),
    guest: "f",
    linked_accounts: JSON.stringify([
      { type: "custom_auth", custom_user_id: customUserId, lv: now },
      {
        type: "wallet",
        wallet_client_type: "privy",
        id: "wallet-1",
        address: "0x1111111111111111111111111111111111111111",
        chain_type: "ethereum",
        lv: now,
      },
    ]),
    ...overrides,
  });
}

function bridgeRequest(access = accessToken(), identity = identityToken(), origin = "https://finaltab.test") {
  return new Request("https://finaltab.test/api/privy/session", {
    headers: {
      authorization: `Bearer ${access}`,
      "privy-id-token": identity,
      origin,
      "sec-fetch-site": origin === "https://finaltab.test" ? "same-origin" : "cross-site",
    },
  });
}

describe("Privy server identity bridge", () => {
  it("verifies both official Privy token types and binds the custom-auth UUID", async () => {
    const result = await verifyPrivyIdentityBridge(
      bridgeRequest(),
      SUPABASE_USER_ID,
      config,
    );

    expect(result).toEqual({
      ok: true,
      identity: {
        privyUserId: PRIVY_USER_ID,
        supabaseUserId: SUPABASE_USER_ID,
        sessionId: "session-123",
        expiresAt: now + 3_600,
        walletAddresses: ["0x1111111111111111111111111111111111111111"],
      },
    });
  });

  it("rejects a Supabase-shaped JWT used as a Privy access token", async () => {
    const confused = accessToken({
      iss: "https://project.supabase.co/auth/v1",
      aud: "authenticated",
      sub: SUPABASE_USER_ID,
    });
    await expect(
      verifyPrivyIdentityBridge(bridgeRequest(confused), SUPABASE_USER_ID, config),
    ).resolves.toEqual({ ok: false, code: "TOKEN_INVALID" });
  });

  it.each([
    ["issuer", { iss: "https://attacker.example" }],
    ["audience", { aud: "another-privy-app" }],
  ])("rejects a Privy token with the wrong %s", async (_label, overrides) => {
    await expect(
      verifyPrivyIdentityBridge(
        bridgeRequest(accessToken(overrides)),
        SUPABASE_USER_ID,
        config,
      ),
    ).resolves.toEqual({ ok: false, code: "TOKEN_INVALID" });
  });

  it("rejects access and identity tokens issued for different Privy users", async () => {
    await expect(
      verifyPrivyIdentityBridge(
        bridgeRequest(accessToken(), identityToken(SUPABASE_USER_ID, { sub: "did:privy:other" })),
        SUPABASE_USER_ID,
        config,
      ),
    ).resolves.toEqual({ ok: false, code: "TOKEN_PAIR_MISMATCH" });
  });

  it("rejects a valid Privy identity linked to a different Supabase UUID", async () => {
    await expect(
      verifyPrivyIdentityBridge(
        bridgeRequest(accessToken(), identityToken(OTHER_SUPABASE_USER_ID)),
        SUPABASE_USER_ID,
        config,
      ),
    ).resolves.toEqual({ ok: false, code: "IDENTITY_BRIDGE_MISMATCH" });
  });

  it("rejects conflicting header and cookie transports", () => {
    const request = new Request("https://finaltab.test/api/privy/session", {
      headers: {
        authorization: `Bearer ${accessToken()}`,
        "privy-id-token": identityToken(),
        cookie: `privy-token=${encodeURIComponent(accessToken({ sid: "other-session" }))}`,
      },
    });
    expect(extractPrivyTokenPair(request)).toEqual({ ok: false, code: "TOKEN_AMBIGUOUS" });
  });

  it("rejects a cross-origin browser request before token verification", async () => {
    await expect(
      verifyPrivyIdentityBridge(
        bridgeRequest(accessToken(), identityToken(), "https://attacker.example"),
        SUPABASE_USER_ID,
        config,
      ),
    ).resolves.toEqual({ ok: false, code: "ORIGIN_REJECTED" });
  });

  it("fails closed when the server app ID or verification key is absent", async () => {
    await expect(
      verifyPrivyIdentityBridge(bridgeRequest(), SUPABASE_USER_ID, null),
    ).resolves.toEqual({ ok: false, code: "PRIVY_NOT_CONFIGURED" });
  });
});
