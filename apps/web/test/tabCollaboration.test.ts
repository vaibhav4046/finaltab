import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AddParticipantSchema,
  ApprovalDecisionSchema,
  CreateTabSchema,
  createInviteToken,
  hashInviteToken,
  inviteExpiry,
  rejectCrossOriginMutation,
} from "@/lib/server/tabCollaboration";

describe("durable tab collaboration boundaries", () => {
  it("creates high-entropy URL-safe invite tokens and hashes only the token", () => {
    const first = createInviteToken();
    const second = createInviteToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashInviteToken("A".repeat(43))).toBe("0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a");
    expect(() => hashInviteToken("short-token")).toThrow();
  });

  it("normalizes draft and participant inputs without inventing wallet identity", () => {
    expect(CreateTabSchema.parse({ title: "  Team dinner  ", currency: "usd" })).toEqual({ title: "Team dinner", currency: "USD" });
    expect(AddParticipantSchema.parse({
      displayName: "  Participant A  ",
      walletAddress: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
    })).toEqual({
      displayName: "Participant A",
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      attachSelf: false,
    });
    expect(AddParticipantSchema.parse({ displayName: "Participant B", walletAddress: null }).walletAddress).toBeNull();
  });

  it("does not expose a path that marks an approval signed", () => {
    expect(ApprovalDecisionSchema.parse({ approvalId: "00000000-0000-4000-8000-000000000001", status: "rejected" }).status).toBe("rejected");
    expect(() => ApprovalDecisionSchema.parse({ approvalId: "00000000-0000-4000-8000-000000000001", status: "signed" })).toThrow();
  });

  it("bounds invitation expiry and rejects cross-origin mutations", async () => {
    expect(inviteExpiry(48, 0)).toBe("1970-01-03T00:00:00.000Z");
    expect(() => inviteExpiry(169)).toThrow();
    expect(rejectCrossOriginMutation(new Request("https://finaltab.test/api/tabs", {
      method: "POST",
      headers: { origin: "https://finaltab.test" },
    }))).toBeNull();
    expect(rejectCrossOriginMutation(new Request("https://finaltab.test/api/tabs", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
    }))).toBeNull();
    expect(rejectCrossOriginMutation(new Request("https://finaltab.test/api/tabs", {
      method: "POST",
      headers: { referer: "https://finaltab.test/app" },
    }))).toBeNull();
    const rejected = rejectCrossOriginMutation(new Request("https://finaltab.test/api/tabs", {
      method: "POST",
      headers: { origin: "https://attacker.test" },
    }));
    expect(rejected?.status).toBe(403);
    expect(await rejected?.json()).toMatchObject({ error: "ORIGIN_REJECTED" });
  });

  it("keeps viewer writes and protected identity columns outside browser grants", () => {
    const migration = readFileSync(
      fileURLToPath(new URL("../../../supabase/migrations/20260811003158_production_tenancy_and_approvals.sql", import.meta.url)),
      "utf8",
    );
    expect(migration).toContain("m.role in ('owner', 'member')");
    expect(migration).toContain("revoke insert, update on public.participants from authenticated");
    expect(migration).toContain("revoke select, insert, update, delete on public.settlement_approvals from authenticated");
    expect(migration).toContain("create or replace function public.list_tab_approval_summaries");
    expect(migration).toContain("revoke insert, update, delete on public.approval_challenges from authenticated");
    expect(migration).toContain("revoke insert, update, delete on public.api_tokens from authenticated");
    expect(migration).toContain("revoke insert, update, delete on public.idempotency_records from authenticated");
    expect(migration).toContain("challenge tab, ledger, participant and user must match");
    expect(migration).toContain("create or replace function public.accept_tab_invite");
    expect(migration).toContain("only rejection or revocation may be recorded here");
    const detailRoute = readFileSync(
      fileURLToPath(new URL("../app/api/tabs/[id]/route.ts", import.meta.url)),
      "utf8",
    );
    expect(detailRoute).toContain('rpc("list_tab_approval_summaries"');
    expect(detailRoute).not.toContain('.from("settlement_approvals")');
  });

  it("lets a policy-checked owner read INSERT RETURNING before membership is materialized", () => {
    const migration = readFileSync(
      fileURLToPath(new URL("../../../supabase/migrations/20260811140612_tab_owner_select_returning.sql", import.meta.url)),
      "utf8",
    );
    expect(migration).toContain("owner_id = (select auth.uid())");
    expect(migration).toContain("or private.is_tab_member(id)");
    expect(migration).not.toContain("for insert");
  });
});
