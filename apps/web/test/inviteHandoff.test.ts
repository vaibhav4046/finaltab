import { afterEach, describe, expect, it } from "vitest";
import {
  clearInviteHandoffCookie,
  inviteHandoffCookie,
  inviteHandoffFromCookie,
  openInviteHandoff,
  sealInviteHandoff,
} from "@/lib/server/inviteHandoff";

const beforeSecret = process.env.FINALTAB_PROOF_SIGNING_SECRET;

afterEach(() => {
  if (beforeSecret === undefined) delete process.env.FINALTAB_PROOF_SIGNING_SECRET;
  else process.env.FINALTAB_PROOF_SIGNING_SECRET = beforeSecret;
});

describe("encrypted invite handoff", () => {
  it("round-trips only with the configured key and inside the short TTL", () => {
    process.env.FINALTAB_PROOF_SIGNING_SECRET = "invite-handoff-test-secret-that-is-longer-than-32-bytes";
    const token = "A".repeat(43);
    const sealed = sealInviteHandoff(token, { nowSeconds: 1_000 });
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain(token);
    expect(openInviteHandoff(sealed, { nowSeconds: 1_100 })).toBe(token);
    expect(openInviteHandoff(sealed, { nowSeconds: 2_801 })).toBeNull();
  });

  it("rejects tampering, the wrong key, and missing configuration", () => {
    process.env.FINALTAB_PROOF_SIGNING_SECRET = "invite-handoff-test-secret-that-is-longer-than-32-bytes";
    const sealed = sealInviteHandoff("B".repeat(43), { nowSeconds: 2_000 });
    expect(sealed).not.toBeNull();
    const changedLastCharacter = sealed!.endsWith("A") ? "B" : "A";
    expect(openInviteHandoff(`${sealed!.slice(0, -1)}${changedLastCharacter}`, { nowSeconds: 2_001 })).toBeNull();

    process.env.FINALTAB_PROOF_SIGNING_SECRET = "different-invite-handoff-secret-longer-than-32-bytes";
    expect(openInviteHandoff(sealed, { nowSeconds: 2_001 })).toBeNull();
    delete process.env.FINALTAB_PROOF_SIGNING_SECRET;
    expect(sealInviteHandoff("B".repeat(43))).toBeNull();
  });

  it("uses an HttpOnly narrow-path cookie and never returns the plaintext", () => {
    process.env.FINALTAB_PROOF_SIGNING_SECRET = "invite-handoff-test-secret-that-is-longer-than-32-bytes";
    const token = "C".repeat(43);
    const sealed = sealInviteHandoff(token)!;
    const cookie = inviteHandoffCookie(sealed, "https://finaltab.example/join", 1_800);
    expect(cookie).toContain("Path=/api/invites; HttpOnly; SameSite=Lax; Max-Age=1800; Secure");
    expect(cookie).not.toContain(token);
    expect(inviteHandoffFromCookie(`other=x; ${cookie.split(";")[0]}`)).toBe(token);
    expect(clearInviteHandoffCookie("https://finaltab.example/join")).toContain("Max-Age=0; Secure");
  });
});
