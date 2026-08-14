import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  INSUFFICIENT_PRIVILEGE,
  RAISE_EXCEPTION,
  asIdentity,
  bootSupabaseSchema,
  raisedBy,
} from "./helpers/supabasePostgres";

// inviteHandoff.test.ts proves the handoff token's cryptography, and
// tenancyIsolationEnforcement.test.ts proves that a stranger sees nothing. The
// join between them was never executed: `create_tab_invite` and
// `accept_tab_invite` are security-definer functions, so they run with the
// definer's rights and their own `raise exception` guards — not RLS — are what
// stand between an invite link and somebody else's tab.
//
// So this runs the whole lifecycle on a real PostgreSQL engine carrying every
// migration, with two different signed-in identities: an owner issues an invite,
// a second person accepts it and becomes a member, and every way of abusing that
// link is attempted. Nothing here is relaxed to make a case pass; each refusal
// below is the migration's own text.
//
// The same two honest limits as its sibling suites: PGlite's PostgreSQL rather
// than the hosted Supabase build, and what the migrations enforce rather than
// what the deployed project's configuration enforces.

const OWNER = randomUUID();
const INVITEE = randomUUID();
const STRANGER = randomUUID();

/** The application stores only a digest of the invite token, never the token. */
const digestOf = (token: string): string => createHash("sha256").update(token).digest("hex");

const freshToken = (): string => randomBytes(32).toString("hex");

describe("tab invite lifecycle enforcement", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = await bootSupabaseSchema();
    for (const [id, email] of [
      [OWNER, "owner@example.test"],
      [INVITEE, "invitee@example.test"],
      [STRANGER, "stranger@example.test"],
    ] as const) {
      await database.query("insert into auth.users(id, email) values ($1::uuid, $2)", [id, email]);
    }
  }, 120_000);

  afterAll(async () => {
    await database?.close();
  });

  const signedIn = <T>(subject: string, body: () => Promise<T>): Promise<T> =>
    asIdentity(database, { role: "authenticated", subject }, body);

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

  const addParticipant = async (actor: string, tabId: string, name: string): Promise<string> => {
    const created = await signedIn(actor, () =>
      database.query<{ id: string }>("select id from public.add_tab_participant(target_tab => $1::uuid, participant_name => $2)", [
        tabId,
        name,
      ]),
    );
    const id = created.rows[0]?.id;
    if (id === undefined) throw new Error("add_tab_participant returned no row");
    return id;
  };

  const inviteExpiringIn = (interval: string) => `now() + interval '${interval}'`;

  const issueInvite = (actor: string, participantId: string, token: string, interval = "1 day") =>
    signedIn(actor, () =>
      database.query<{ participant_id: string; tab_id: string }>(
        `select participant_id, tab_id from public.create_tab_invite(
           target_participant => $1::uuid,
           token_digest => $2,
           requested_expires_at => ${inviteExpiringIn(interval)})`,
        [participantId, digestOf(token)],
      ),
    );

  const acceptInvite = (actor: string, token: string) =>
    signedIn(actor, () =>
      database.query<{ tab_id: string; participant_id: string; tab_title: string }>(
        "select tab_id, participant_id, tab_title from public.accept_tab_invite(token_digest => $1)",
        [digestOf(token)],
      ),
    );

  it("carries two real identities through the whole collaboration path", async () => {
    const tabId = await createTab(OWNER, "shared trip");
    const participantId = await addParticipant(OWNER, tabId, "Invitee");
    const token = freshToken();

    // Before accepting, the invitee is a stranger to this tab.
    const beforeJoin = await signedIn(INVITEE, () =>
      database.query<{ id: string }>("select id from public.tabs where id = $1::uuid", [tabId]),
    );
    expect(beforeJoin.rows).toEqual([]);

    await issueInvite(OWNER, participantId, token);
    const accepted = await acceptInvite(INVITEE, token);
    expect(accepted.rows).toEqual([{ tab_id: tabId, participant_id: participantId, tab_title: "shared trip" }]);

    // After accepting, the same query the policy refused now returns the tab,
    // and membership exists as a row rather than as an application assumption.
    const afterJoin = await signedIn(INVITEE, () =>
      database.query<{ id: string }>("select id from public.tabs where id = $1::uuid", [tabId]),
    );
    expect(afterJoin.rows).toEqual([{ id: tabId }]);

    const membership = await signedIn(OWNER, () =>
      database.query<{ user_id: string; role: string }>(
        "select user_id, role from public.tab_members where tab_id = $1::uuid order by role",
        [tabId],
      ),
    );
    expect(membership.rows).toEqual([
      { user_id: INVITEE, role: "member" },
      { user_id: OWNER, role: "owner" },
    ]);

    // The invitee joined as a member, not as an owner: the join must not be a
    // privilege escalation path. A policy may refuse this outright or match no
    // row; the invariant under test is that ownership does not move either way.
    await signedIn(INVITEE, async () => {
      try {
        await database.query("update public.tabs set owner_id = $1::uuid where id = $2::uuid", [INVITEE, tabId]);
      } catch {
        // Refused outright, which is the stronger of the two acceptable outcomes.
      }
    });
    const ownership = await signedIn(OWNER, () =>
      database.query<{ owner_id: string }>("select owner_id from public.tabs where id = $1::uuid", [tabId]),
    );
    expect(ownership.rows).toEqual([{ owner_id: OWNER }]);
  }, 60_000);

  it("burns the invite on acceptance so the same link cannot be replayed", async () => {
    const tabId = await createTab(OWNER, "replay tab");
    const participantId = await addParticipant(OWNER, tabId, "First");
    const token = freshToken();
    await issueInvite(OWNER, participantId, token);
    await acceptInvite(INVITEE, token);

    // The digest is cleared on acceptance, so a captured link is inert even for
    // the person it was issued to.
    const replayedBySamePerson = await raisedBy(() => acceptInvite(INVITEE, token));
    expect(replayedBySamePerson.code).toBe(RAISE_EXCEPTION);
    expect(replayedBySamePerson.message).toContain("invite invalid or expired");

    const replayedByStranger = await raisedBy(() => acceptInvite(STRANGER, token));
    expect(replayedByStranger.code).toBe(RAISE_EXCEPTION);
    expect(replayedByStranger.message).toContain("invite invalid or expired");

    const stored = await signedIn(OWNER, () =>
      database.query<{ invite_token_hash: string | null; invite_status: string; user_id: string }>(
        "select invite_token_hash, invite_status, user_id from public.participants where id = $1::uuid",
        [participantId],
      ),
    );
    expect(stored.rows).toEqual([{ invite_token_hash: null, invite_status: "joined", user_id: INVITEE }]);
  }, 60_000);

  it("refuses an expired invite even though the digest still matches", async () => {
    const tabId = await createTab(OWNER, "expiry tab");
    const participantId = await addParticipant(OWNER, tabId, "Late");
    const token = freshToken();
    await issueInvite(OWNER, participantId, token);

    // Expire it in the table rather than by waiting, so the only thing that has
    // changed is the timestamp the function checks.
    await database.query(
      "update public.participants set invite_expires_at = now() - interval '1 second' where id = $1::uuid",
      [participantId],
    );

    const raised = await raisedBy(() => acceptInvite(INVITEE, token));
    expect(raised.code).toBe(RAISE_EXCEPTION);
    expect(raised.message).toContain("invite invalid or expired");

    const untouched = await signedIn(OWNER, () =>
      database.query<{ user_id: string | null; invite_status: string }>(
        "select user_id, invite_status from public.participants where id = $1::uuid",
        [participantId],
      ),
    );
    expect(untouched.rows).toEqual([{ user_id: null, invite_status: "invited" }]);
  }, 60_000);

  it("refuses invite expiries outside the permitted window at issue time", async () => {
    const tabId = await createTab(OWNER, "window tab");
    const participantId = await addParticipant(OWNER, tabId, "Windowed");

    const tooSoon = await raisedBy(() => issueInvite(OWNER, participantId, freshToken(), "1 minute"));
    expect(tooSoon.code).toBe(RAISE_EXCEPTION);
    expect(tooSoon.message).toContain("invite expiry must be between 5 minutes and 7 days");

    const tooLate = await raisedBy(() => issueInvite(OWNER, participantId, freshToken(), "8 days"));
    expect(tooLate.code).toBe(RAISE_EXCEPTION);
    expect(tooLate.message).toContain("invite expiry must be between 5 minutes and 7 days");
  }, 60_000);

  it("refuses a malformed digest at both ends of the lifecycle", async () => {
    const tabId = await createTab(OWNER, "digest tab");
    const participantId = await addParticipant(OWNER, tabId, "Malformed");

    // A caller that passes the raw token instead of its digest must be refused
    // rather than quietly storing a guessable value.
    const issuing = await signedIn(OWNER, () =>
      raisedBy(() =>
        database.query(
          `select participant_id from public.create_tab_invite(
             target_participant => $1::uuid, token_digest => $2,
             requested_expires_at => ${inviteExpiringIn("1 day")})`,
          [participantId, "not-a-sha256-digest"],
        ),
      ),
    );
    expect(issuing.code).toBe(RAISE_EXCEPTION);
    expect(issuing.message).toContain("invalid invite digest");

    const accepting = await signedIn(INVITEE, () =>
      raisedBy(() => database.query("select tab_id from public.accept_tab_invite(token_digest => $1)", ["../../etc/passwd"])),
    );
    expect(accepting.code).toBe(RAISE_EXCEPTION);
    expect(accepting.message).toContain("invalid invite digest");
  }, 60_000);

  it("refuses to let a stranger issue an invite into a tab they cannot edit", async () => {
    const tabId = await createTab(OWNER, "stranger issue tab");
    const participantId = await addParticipant(OWNER, tabId, "Target");

    // The function is security definer, so RLS does not protect this row. The
    // editor check inside it is the only guard, and it is the one under test.
    const raised = await raisedBy(() => issueInvite(STRANGER, participantId, freshToken()));
    expect(raised.code).toBe(RAISE_EXCEPTION);
    expect(raised.message).toContain("tab editor access required");
  }, 60_000);

  it("refuses to re-invite a participant that has already joined", async () => {
    const tabId = await createTab(OWNER, "rejoin tab");
    const participantId = await addParticipant(OWNER, tabId, "Joined");
    const token = freshToken();
    await issueInvite(OWNER, participantId, token);
    await acceptInvite(INVITEE, token);

    // Re-issuing would otherwise hand a second person the seat of somebody who
    // is already in the tab.
    const raised = await raisedBy(() => issueInvite(OWNER, participantId, freshToken()));
    expect(raised.code).toBe(RAISE_EXCEPTION);
    expect(raised.message).toContain("participant has already joined");
  }, 60_000);

  it("refuses a second seat to a user who is already a participant in the tab", async () => {
    const tabId = await createTab(OWNER, "double seat tab");
    const firstSeat = await addParticipant(OWNER, tabId, "Seat one");
    const secondSeat = await addParticipant(OWNER, tabId, "Seat two");
    const firstToken = freshToken();
    const secondToken = freshToken();
    await issueInvite(OWNER, firstSeat, firstToken);
    await issueInvite(OWNER, secondSeat, secondToken);
    await acceptInvite(INVITEE, firstToken);

    const raised = await raisedBy(() => acceptInvite(INVITEE, secondToken));
    expect(raised.code).toBe(RAISE_EXCEPTION);
    expect(raised.message).toContain("user is already a participant in this tab");

    // The refused seat stays open for whoever it was meant for.
    const open = await signedIn(OWNER, () =>
      database.query<{ user_id: string | null; invite_status: string }>(
        "select user_id, invite_status from public.participants where id = $1::uuid",
        [secondSeat],
      ),
    );
    expect(open.rows).toEqual([{ user_id: null, invite_status: "invited" }]);
  }, 60_000);

  it("refuses every invite function outright to an anonymous caller", async () => {
    const tabId = await createTab(OWNER, "anon tab");
    const participantId = await addParticipant(OWNER, tabId, "Anon target");
    const token = freshToken();
    await issueInvite(OWNER, participantId, token);

    const issuing = await asIdentity(database, { role: "anon" }, () =>
      raisedBy(() =>
        database.query(
          `select participant_id from public.create_tab_invite(
             target_participant => $1::uuid, token_digest => $2,
             requested_expires_at => ${inviteExpiringIn("1 day")})`,
          [participantId, digestOf(freshToken())],
        ),
      ),
    );
    // Either shape is a fail-closed refusal: no EXECUTE grant for `anon`, or the
    // function's own `authentication required` once auth.uid() comes back null.
    expect([INSUFFICIENT_PRIVILEGE, RAISE_EXCEPTION]).toContain(issuing.code);

    // Holding a valid token is not enough: the acceptance needs a subject to
    // attach the seat to, and an anonymous caller has none.
    const accepting = await asIdentity(database, { role: "anon" }, () =>
      raisedBy(() => database.query("select tab_id from public.accept_tab_invite(token_digest => $1)", [digestOf(token)])),
    );
    expect([INSUFFICIENT_PRIVILEGE, RAISE_EXCEPTION]).toContain(accepting.code);
  }, 60_000);
});
