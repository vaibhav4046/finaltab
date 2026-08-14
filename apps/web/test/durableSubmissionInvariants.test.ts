import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// settlementSubmission.test.ts drives the TypeScript path against a mocked
// Supabase client, so every guarantee that lives in SQL is invisible to it. The
// durable journal deliberately re-checks in the database what the server has
// already checked in TypeScript — service-role authority, approval expiry,
// preparation freshness, one intent per execution — so that a compromised or
// simply buggy caller still cannot advance the journal. Those second gates are
// the whole point of the design and nothing in CI notices if a migration edit
// drops one.
//
// These assertions are static: they prove the clauses are present in the
// migration, not that a running Postgres enforces them. The enforcement half
// lives in durableSubmissionJournalEnforcement.test.ts, which applies these same
// migrations to a real PostgreSQL engine and makes the database refuse the
// calls. Both are kept, because they fail differently — this file names the
// clause that went missing, that one catches a clause that survived an edit and
// stopped biting.

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260811074000_durable_submission_intents.sql", import.meta.url)),
  "utf8",
);

/** Body of one `create function public.<name>`, so an assertion cannot pass because a sibling function happens to contain the clause. */
const functionBody = (name: string): string => {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  const from = start === -1 ? migration.indexOf(`create function public.${name}(`) : start;
  expect(from, `function ${name} is declared`).toBeGreaterThan(-1);
  const end = migration.indexOf("$$;", from);
  expect(end, `function ${name} is terminated`).toBeGreaterThan(from);
  return migration.slice(from, end);
};

const DURABLE_FUNCTIONS = [
  "read_durable_settlement_submission_retry",
  "prepare_durable_settlement_submission",
  "record_durable_settlement_acceptance",
  "assert_durable_settlement_observation_access",
  "record_durable_settlement_observation",
];

describe("durable submission journal invariants", () => {
  it("admits only the service role to every journal function", () => {
    for (const name of DURABLE_FUNCTIONS) {
      expect(functionBody(name)).toContain("(select auth.role()) is distinct from 'service_role'");
    }
    expect(migration).toMatch(
      /revoke all on public\.settlement_submission_intents, public\.settlement_submission_events\s+from public, anon, authenticated;/,
    );
    for (const table of ["settlement_submission_intents", "settlement_submission_events"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    for (const name of DURABLE_FUNCTIONS) {
      expect(migration).toContain(`revoke all on function public.${name}(`);
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\)\\s*to service_role;`));
    }
  });

  it("refuses to renew a retry against a missing, expired or over-long approval", () => {
    const retry = functionBody("read_durable_settlement_submission_retry");
    expect(retry).toContain("approval_expiry is null or approval_expiry <= now()");
    expect(retry).toContain("approval_expiry > now() + interval '16 minutes'");
    expect(retry).toContain("raise exception 'invalid durable retry binding'");
    // A fresh approval may re-bind a still-prepared intent. An accepted one is
    // past the point where a new approval could change anything.
    expect(retry).toContain("if intent.state = 'prepared'");
  });

  it("rejects a stale or future preparation timestamp", () => {
    const prepare = functionBody("prepare_durable_settlement_submission");
    expect(prepare).toContain("prepared_timestamp < now() - interval '5 minutes'");
    expect(prepare).toContain("prepared_timestamp > now() + interval '1 minute'");
    expect(prepare).toContain("approval_expiry is null or approval_expiry <= now()");
  });

  it("stores one intent per idempotency key and one intent per execution", () => {
    expect(migration).toContain("idempotency_key text primary key");
    expect(migration).toContain("create unique index idx_submission_intents_execution");
    expect(functionBody("prepare_durable_settlement_submission")).toContain(
      "on conflict (idempotency_key) do nothing",
    );
  });

  it("advances an intent to accepted from revision 1 only", () => {
    const accept = functionBody("record_durable_settlement_acceptance");
    expect(accept).toContain("raise exception 'SUBMISSION_ACCEPTANCE_CONFLICT'");
    expect(accept).toContain("if intent.revision <> 1 then raise exception 'SUBMISSION_ACCEPTANCE_TRANSITION_REJECTED'");
    expect(accept).toContain("revision = 2");
  });

  it("binds terminal proof to the accepted execution and keeps revisions monotonic", () => {
    const observe = functionBody("record_durable_settlement_observation");
    expect(observe).toContain("raise exception 'SUBMISSION_PROOF_BINDING_MISMATCH'");
    expect(observe).toContain("VERIFIED_SUBMISSION_REQUIRES_EXACT_CHAIN_PROOF");
    expect(observe).toContain("raise exception 'SUBMISSION_OBSERVATION_TRANSITION_REJECTED'");
    expect(functionBody("assert_durable_settlement_observation_access")).toContain(
      "raise exception 'SUBMISSION_ACCEPTANCE_NOT_FOUND'",
    );
  });

  it("persists the principal, approval and signed body as digests only", () => {
    for (const column of ["principal_subject_hash", "approval_hash", "signed_body_hash", "simulation_hash"]) {
      expect(migration).toContain(`${column} text not null check (${column} ~ '^[0-9a-f]{64}$')`);
    }
    // The journal has no column that could hold a wallet signature, a provider
    // key or an MCP bearer token in the clear.
    expect(migration).not.toMatch(/^\s+\w*(signature|secret|token|private_key|api_key)\w*\s+(text|jsonb|bytea)/im);
  });

  it("only records a simulation that succeeded and would not revert", () => {
    expect(migration).toContain("simulation_record ->> 'success' is not distinct from 'true'");
    expect(migration).toContain("coalesce(simulation_record ->> 'wouldRevert', 'false') = 'false'");
    expect(migration).toContain("check (approval_expires_at > prepared_at)");
  });
});
