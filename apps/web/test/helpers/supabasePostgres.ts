import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

// Boots a real PostgreSQL engine in-process and applies this repo's Supabase
// migrations to it, so a test can execute the policies and journal functions
// instead of reading them as strings.
//
// The platform pieces Supabase provides are ordinary SQL, and are reproduced
// here rather than stubbed: the four PostgREST roles, the auth schema, and the
// auth.* claim readers. auth.uid() and auth.role() are not privileged magic —
// they read the verified JWT that PostgREST puts in the request.jwt.claims GUC
// before running the statement. Setting that GUC is therefore how a session
// identity is simulated, and the migrations' own policies are exercised
// unmodified.
//
// The default privileges matter as much as the roles. Supabase grants anon and
// authenticated full table privileges on new objects in public, which is why
// RLS is the layer that protects a Supabase table and why the migrations
// bother to revoke those grants where a table must not be reachable at all.
// Without these grants the revokes would be no-ops and a passing test would
// prove less than it appears to.
//
// pgcrypto is not bundled with PGlite and is not needed: gen_random_uuid() has
// been a core builtin since PostgreSQL 13.
const PLATFORM_PRELUDE = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator noinherit login;
grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
create schema if not exists extensions;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', current_user::text);
$$;
create or replace function auth.email() returns text language sql stable as $$
  select auth.jwt() ->> 'email';
$$;

-- Every policy calls auth.uid(), so the PostgREST roles must be able to reach
-- it, exactly as they can on Supabase. auth.users itself stays unreadable to
-- them, which is also how Supabase leaves it.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid(), auth.role(), auth.email()
  to anon, authenticated, service_role;
`;

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../../../supabase/migrations", import.meta.url));

export const migrationFileNames = (): readonly string[] =>
  readdirSync(MIGRATIONS_DIRECTORY)
    .filter((name) => name.endsWith(".sql"))
    .sort();

/** A real Postgres with every migration in `supabase/migrations` applied in order. */
export const bootSupabaseSchema = async (): Promise<PGlite> => {
  const database = await PGlite.create();
  await database.exec(PLATFORM_PRELUDE);
  for (const name of migrationFileNames()) {
    await database.exec(readFileSync(join(MIGRATIONS_DIRECTORY, name), "utf8"));
  }
  return database;
};

export type PostgrestRole = "anon" | "authenticated" | "service_role";

export interface SessionIdentity {
  readonly role: PostgrestRole;
  /** The `sub` claim, which is what auth.uid() returns. */
  readonly subject?: string;
  readonly email?: string;
}

/**
 * Runs `body` the way PostgREST would run a request for `identity`: the verified
 * claims are published to the GUC and the connection assumes the matching role,
 * so both the GRANT layer and every RLS policy see that identity.
 *
 * Migrations are applied by the bootstrapping superuser, who owns the tables and
 * would otherwise bypass RLS entirely, so `set role` is what makes a policy test
 * mean anything.
 */
export const asIdentity = async <T>(
  database: PGlite,
  identity: SessionIdentity,
  body: () => Promise<T>,
): Promise<T> => {
  const claims: Record<string, string> = { role: identity.role };
  if (identity.subject !== undefined) claims.sub = identity.subject;
  if (identity.email !== undefined) claims.email = identity.email;
  await database.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await database.exec(`set role ${identity.role};`);
  try {
    return await body();
  } finally {
    await database.exec("reset role;");
    await database.query("select set_config('request.jwt.claims', '', false)");
  }
};

/**
 * The message and SQLSTATE Postgres raised. Tests assert on both so that a
 * `raise exception` cannot be mistaken for a permission denial, or the reverse.
 */
export interface RaisedError {
  readonly message: string;
  readonly code: string;
}

export const raisedBy = async (body: () => Promise<unknown>): Promise<RaisedError> => {
  try {
    await body();
  } catch (error) {
    const raised = error as { message?: unknown; code?: unknown };
    return {
      message: typeof raised.message === "string" ? raised.message : String(error),
      code: typeof raised.code === "string" ? raised.code : "",
    };
  }
  throw new Error("expected the statement to be rejected, but it succeeded");
};

/** SQLSTATE 42501, raised by the GRANT layer before any policy or function body runs. */
export const INSUFFICIENT_PRIVILEGE = "42501";
/** SQLSTATE P0001, raised by `raise exception` inside a function body. */
export const RAISE_EXCEPTION = "P0001";
/** SQLSTATE 23514, raised by the storage layer when a check constraint refuses a row. */
export const CHECK_VIOLATION = "23514";
/** SQLSTATE 42501 with a policy-shaped message, which is how RLS reports a refused write. */
export const ROW_LEVEL_SECURITY_VIOLATION = "42501";
