import { describe, expect, it } from "vitest";
import { privyPublicConfig, privyConfigInternals } from "@/lib/privy/config";
import { privyServerConfig, privyServerInternals } from "@/lib/privy/server";

const PUBLIC_KEY = [
  "-----BEGIN PUBLIC KEY-----",
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "-----END PUBLIC KEY-----",
].join("\n");

describe("Privy configuration", () => {
  it("fails closed when the public app ID is missing or placeholder-shaped", () => {
    expect(privyPublicConfig({})).toBeNull();
    expect(privyPublicConfig({ NEXT_PUBLIC_PRIVY_APP_ID: "<app-id>" })).toBeNull();
    expect(privyPublicConfig({ NEXT_PUBLIC_PRIVY_APP_ID: "abc" })).toBeNull();
  });

  it("accepts opaque public identifiers and a clean HTTPS API origin", () => {
    expect(privyPublicConfig({
      NEXT_PUBLIC_PRIVY_APP_ID: "privy_app_123",
      NEXT_PUBLIC_PRIVY_CLIENT_ID: "web_client_456",
      NEXT_PUBLIC_PRIVY_API_URL: "https://privy.accounts.example/",
    })).toEqual({
      appId: "privy_app_123",
      clientId: "web_client_456",
      apiUrl: "https://privy.accounts.example",
    });
  });

  it("drops optional values that are malformed without weakening the app-ID gate", () => {
    expect(privyPublicConfig({
      NEXT_PUBLIC_PRIVY_APP_ID: "privy_app_123",
      NEXT_PUBLIC_PRIVY_CLIENT_ID: "bad client id",
      NEXT_PUBLIC_PRIVY_API_URL: "http://privy.example/path",
    })).toEqual({ appId: "privy_app_123" });
  });

  it("requires a server-only verification key and normalizes escaped newlines", () => {
    const escapedKey = PUBLIC_KEY.replaceAll("\n", "\\n");
    expect(privyServerConfig({
      NEXT_PUBLIC_PRIVY_APP_ID: "privy_app_123",
      PRIVY_VERIFICATION_KEY: escapedKey,
    })).toMatchObject({ appId: "privy_app_123", verificationKey: PUBLIC_KEY });
    expect(privyServerConfig({ NEXT_PUBLIC_PRIVY_APP_ID: "privy_app_123" })).toBeNull();
  });

  it("rejects non-HTTPS custom origins and non-PEM verification material", () => {
    expect(privyConfigInternals.optionalHttpsOrigin("javascript:alert(1)")).toBeUndefined();
    expect(privyServerInternals.normalizeVerificationKey("secret-value")).toBeNull();
  });
});
