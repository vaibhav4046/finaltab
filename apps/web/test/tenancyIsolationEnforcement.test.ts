import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  INSUFFICIENT_PRIVILEGE,
  RAISE_EXCEPTION,
  asIdentity,
  bootSupabaseSchema,
  raisedBy,
} from "./helpers/supabasePostgres";

// The live anonymous authorization probe proves the deployed project refuses an
// unauthenticated caller, and it lands at the GRANT layer before RLS is even
// consulted. That leaves the more interesting half unproven: `authenticated`
// does hold table grants, so for one signed-in user against another it is the
// policies themselves that decide, and nothing until now executed them.
//
// This applies the migrations to a real PostgreSQL engine and runs two
// different signed-in identities against them. auth.uid() reads the verified
// claims PostgREST publishes before each statement, so setting those claims and
// assuming the matching role is what a session is. No policy is relaxed,
// reworded or dropped to make anything here pass; every refusal below is the
// migration's own.
//
// Two honest limits, the same ones the durable journal test carries: the engine
// is the PostgreSQL that PGlite ships rather than the hosted Supabase version,
// and this proves what the migrations enforce rather than what the deployed
// project's configuration enforces.

const ANA = randomUUID();
const BEN = randomUUID();

describe("tenancy isolation enforcement", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = await bootSupabaseSchema();
    for (const [id, email] of [
      [ANA, "ana@example.test"],
      [BEN, "ben@example.test"],
    ] as const) {
      await database.query("insert into auth.users(id, email) values ($1::uuid, $2)", [id, email]);
    }
  }, 120_000);

  afterAll(async () => {
    await database?.close();
  });

  const signedIn = <T>(subject: string, body: () => Promise<T>): Promise<T> =>
    asIdentity(database, { role: "authenticated", subject }, body);

  /** A tab created the way the application creates one: by the signed-in owner, through RLS. */
  const createTab = async (owner: string, title: string): Promise<string> => {
    const created = await signedIn(owner, () =>
      database.query<{ id: string }>(
        "insert into public.tabs(title, currency, owner_id) values ($1, $2, $3::uuid) returning id",
        [title, "USD", owner],
      ),
    );
    const id = created.rows[0]?.id;
    if (id === undefined) throw new Error("tab insert returned no row");
    return id;
  };

  const visibleTabIds = (subject: string): Promise<readonly string[]> =>
    signedIn(subject, async () => {
      const seen = await database.query<{ id: string }>("select id from public.tabs order by title");
      return seen.rows.map((row) => row.id);
    });

  it("binds a new tab to the signed-in owner and enrols them as its owning member", async () => {
    const tabId = await createTab(ANA, "ana solo dinner");

    const membership = await signedIn(ANA, () =>
      database.query<{ user_id: string; role: string }>(
        "select user_id, role from public.tab_members where tab_id = $1::uuid",
        [tabId],
      ),
    );
    expect(membership.rows).toEqual([{ user_id: ANA, role: "owner" }]);
  }, 60_000);

  it("refuses to let a signed-in user create a tab owned by somebody else", async () => {
    const raised = await signedIn(ANA, () =>
      raisedBy(() =>
        database.query("insert into public.tabs(title, currency, owner_id) values ($1, $2, $3::uuid)", [
          "a tab in ben's name",
          "USD",
          BEN,
        ]),
      ),
    );
    expect(raised.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(raised.message).toContain('violates row-level security policy for table "tabs"');
  }, 60_000);

  it("refuses a privileged writer that binds a tab to somebody other than the acting user", async () => {
    // RLS is what stops the request above, and a writer that bypasses RLS —
    // the service role, or a future security-definer helper — would sail past
    // it. The owner-binding trigger is the second gate, so it is exercised here
    // from a connection that RLS does not apply to at all.
    await database.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ role: "authenticated", sub: ANA }),
    ]);
    try {
      const raised = await raisedBy(() =>
        database.query("insert into public.tabs(title, currency, owner_id) values ($1, $2, $3::uuid)", [
          "a tab in ben's name",
          "USD",
          BEN,
        ]),
      );
      expect(raised.code).toBe(RAISE_EXCEPTION);
      expect(raised.message).toBe("tab owner must be the authenticated user");
    } finally {
      await database.query("select set_config('request.jwt.claims', '', false)");
    }
  }, 60_000);

  it("shows each signed-in identity only the tabs they belong to", async () => {
    const anaTab = await createTab(ANA, "ana isolation tab");
    const benTab = await createTab(BEN, "ben isolation tab");

    expect(await visibleTabIds(ANA)).toContain(anaTab);
    expect(await visibleTabIds(ANA)).not.toContain(benTab);
    expect(await visibleTabIds(BEN)).toContain(benTab);
    expect(await visibleTabIds(BEN)).not.toContain(anaTab);
  }, 60_000);

  it("gives a stranger no read, no write and no delete across the tenancy boundary", async () => {
    const anaTab = await createTab(ANA, "ana private tab");

    await signedIn(BEN, async () => {
      const read = await database.query("select id from public.tabs where id = $1::uuid", [anaTab]);
      expect(read.rows).toEqual([]);

      // A policy that filters rather than raises is the correct behaviour here,
      // so the assertion is that nothing was touched, not that an error came back.
      const updated = await database.query("update public.tabs set title = $2 where id = $1::uuid", [
        anaTab,
        "renamed by a stranger",
      ]);
      expect(updated.affectedRows).toBe(0);

      const deleted = await database.query("delete from public.tabs where id = $1::uuid", [anaTab]);
      expect(deleted.affectedRows).toBe(0);
    });

    const survivor = await signedIn(ANA, () =>
      database.query<{ title: string }>("select title from public.tabs where id = $1::uuid", [anaTab]),
    );
    expect(survivor.rows[0]?.title).toBe("ana private tab");
  }, 60_000);

  it("refuses to let a signed-in user rewrite the ownership of their own tab", async () => {
    const anaTab = await createTab(ANA, "ana ownership tab");

    const raised = await signedIn(ANA, () =>
      raisedBy(() =>
        database.query("update public.tabs set owner_id = $2::uuid where id = $1::uuid", [anaTab, BEN]),
      ),
    );
    expect(raised.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(raised.message).toContain("permission denied");
  }, 60_000);

  it("widens visibility only through a membership the user cannot grant themselves", async () => {
    const anaTab = await createTab(ANA, "ana shared dinner");

    // The column grants stop a user from writing their own way into a tab: tab
    // membership is authored by the security-definer invite functions, never by
    // the client, so the denial lands at the GRANT layer before any policy runs.
    const selfEnrolment = await signedIn(BEN, () =>
      raisedBy(() =>
        database.query("insert into public.tab_members(tab_id, user_id, role) values ($1::uuid, $2::uuid, $3)", [
          anaTab,
          BEN,
          "member",
        ]),
      ),
    );
    expect(selfEnrolment.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(selfEnrolment.message).toBe("permission denied for table tab_members");
    expect(await visibleTabIds(BEN)).not.toContain(anaTab);

    // Recorded the way accept_tab_invite records it, membership is what the
    // policies key on, so the same tab becomes readable without a policy change.
    await database.query(
      "insert into public.tab_members(tab_id, user_id, role) values ($1::uuid, $2::uuid, 'member')",
      [anaTab, BEN],
    );
    expect(await visibleTabIds(BEN)).toContain(anaTab);

    // Membership is not ownership: a member still cannot rename or delete the tab.
    await signedIn(BEN, async () => {
      const renamed = await database.query("update public.tabs set title = $2 where id = $1::uuid", [
        anaTab,
        "renamed by a member",
      ]);
      expect(renamed.affectedRows).toBe(0);
      const removed = await database.query("delete from public.tabs where id = $1::uuid", [anaTab]);
      expect(removed.affectedRows).toBe(0);
    });
  }, 60_000);

  it("holds tab-owned rows behind the same membership gate as the tab", async () => {
    const anaTab = await createTab(ANA, "ana receipts tab");
    await database.query("insert into public.participants(tab_id, display_name) values ($1::uuid, $2)", [
      anaTab,
      "Ana",
    ]);

    const strangerSees = await signedIn(BEN, () =>
      database.query("select id from public.participants where tab_id = $1::uuid", [anaTab]),
    );
    expect(strangerSees.rows).toEqual([]);

    const ownerSees = await signedIn(ANA, () =>
      database.query<{ display_name: string }>(
        "select display_name from public.participants where tab_id = $1::uuid",
        [anaTab],
      ),
    );
    expect(ownerSees.rows).toEqual([{ display_name: "Ana" }]);
  }, 60_000);

  it("keeps settlement approvals out of reach of any signed-in client", async () => {
    // Approvals carry the signed authority for value movement, so they are
    // revoked outright rather than merely policy-gated.
    const raised = await signedIn(ANA, () =>
      raisedBy(() => database.query("select 1 from public.settlement_approvals")),
    );
    expect(raised.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(raised.message).toBe("permission denied for table settlement_approvals");
  }, 60_000);

  it("denies the anonymous role every tenancy table outright", async () => {
    for (const table of ["tabs", "tab_members", "participants", "ledgers", "settlements"] as const) {
      const raised = await asIdentity(database, { role: "anon" }, () =>
        raisedBy(() => database.query(`select 1 from public.${table}`)),
      );
      expect(raised.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect(raised.message).toBe(`permission denied for table ${table}`);
    }
  }, 60_000);

  it("leaves no public table without row-level security", async () => {
    const unprotected = await database.query<{ tablename: string }>(
      `select tablename from pg_tables
       where schemaname = 'public' and rowsecurity is not true
       order by tablename`,
    );
    expect(unprotected.rows).toEqual([]);
  }, 60_000);
});
