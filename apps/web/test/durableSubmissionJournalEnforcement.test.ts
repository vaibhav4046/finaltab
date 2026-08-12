import { createHash, randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHECK_VIOLATION,
  INSUFFICIENT_PRIVILEGE,
  RAISE_EXCEPTION,
  asIdentity,
  bootSupabaseSchema,
  raisedBy,
} from "./helpers/supabasePostgres";

// durableSubmissionInvariants.test.ts asserts that the fail-closed clauses are
// present in the migration text. That catches a deletion but not a defeat: a
// clause can survive an edit and stop biting, and a string match cannot tell
// the difference. This file applies the same migrations to a real PostgreSQL
// engine and makes the database refuse the calls, so what is proven is
// enforcement rather than presence.
//
// Two honest limits. The engine here is the PostgreSQL that PGlite ships,
// which is not the version the hosted Supabase project runs; and this proves
// what the migrations in this repository enforce, not what the deployed
// project's own configuration enforces. The live anonymous authorization probe
// covers the deployed half.

const digest = (seed: string): string => createHash("sha256").update(seed).digest("hex");
const hash32 = (seed: string): string => `0x${digest(seed)}`;

const CONTRACT_ADDRESS = "0x7b58791cebd9a82f8ee4e4cf87e7ad1b64a3ccdb";
const BASE_SEPOLIA = 84532;
const PLAN_HASH = hash32("settlement-plan");
const LEDGER_HASH = hash32("settlement-ledger");
const PRINCIPAL = digest("principal-subject");

const minutesFromNow = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString();

interface PreparationOverrides {
  readonly principal?: string;
  readonly idempotencyKey?: string;
  readonly signedBody?: string;
  readonly approvalExpiry?: string;
  readonly simulation?: unknown;
  readonly planHash?: string;
  readonly chainId?: number;
  readonly preparedAt?: string;
}

interface AcceptanceOverrides {
  readonly idempotencyKey?: string;
  readonly executionId?: string;
  readonly executionRecord?: unknown;
  readonly acceptedAt?: string;
}

interface ObservationOverrides {
  readonly executionId?: string;
  readonly state?: string;
  readonly status?: unknown;
  readonly proof?: unknown;
  readonly eventSeed?: string;
}

describe("durable settlement journal enforcement", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = await bootSupabaseSchema();
  }, 120_000);

  afterAll(async () => {
    await database?.close();
  });

  const asServiceRole = <T>(body: () => Promise<T>): Promise<T> =>
    asIdentity(database, { role: "service_role" }, body);

  const prepare = (overrides: PreparationOverrides = {}) => {
    const key = overrides.idempotencyKey ?? digest("intent");
    return database.query(
      `select state, revision, idempotency_key, plan_hash, contract_address
       from public.prepare_durable_settlement_submission(
         $1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb, $8, $9, $10::bigint, $11,
         $12::uuid, $13::uuid, $14::timestamptz, $15)`,
      [
        overrides.principal ?? PRINCIPAL,
        key,
        overrides.signedBody ?? digest("signed-body"),
        digest(`approval-${key}`),
        overrides.approvalExpiry ?? minutesFromNow(10),
        digest(`simulation-${key}`),
        JSON.stringify(overrides.simulation ?? { success: true, wouldRevert: false }),
        overrides.planHash ?? PLAN_HASH,
        LEDGER_HASH,
        overrides.chainId ?? BASE_SEPOLIA,
        CONTRACT_ADDRESS,
        null,
        null,
        overrides.preparedAt ?? new Date().toISOString(),
        digest(`prepared-event-${key}`),
      ],
    );
  };

  const readRetry = (overrides: PreparationOverrides = {}) => {
    const key = overrides.idempotencyKey ?? digest("intent");
    return database.query(
      `select state, revision from public.read_durable_settlement_submission_retry(
         $1, $2, $3, $4, $5::timestamptz, $6, $7, $8::bigint, $9, $10::uuid, $11::uuid)`,
      [
        PRINCIPAL,
        key,
        overrides.signedBody ?? digest("signed-body"),
        digest(`approval-${key}`),
        overrides.approvalExpiry ?? minutesFromNow(10),
        PLAN_HASH,
        LEDGER_HASH,
        overrides.chainId ?? BASE_SEPOLIA,
        CONTRACT_ADDRESS,
        null,
        null,
      ],
    );
  };

  const accept = (overrides: AcceptanceOverrides = {}) => {
    const key = overrides.idempotencyKey ?? digest("intent");
    const executionId = overrides.executionId ?? `exec_${digest(key).slice(0, 24)}`;
    return database.query(
      `select state, revision, execution_id from public.record_durable_settlement_acceptance(
         $1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, $8)`,
      [
        PRINCIPAL,
        key,
        digest("signed-body"),
        executionId,
        JSON.stringify(overrides.executionRecord ?? { executionId }),
        digest(`execution-${executionId}`),
        overrides.acceptedAt ?? new Date().toISOString(),
        digest(`accepted-event-${executionId}`),
      ],
    );
  };

  /** A KeeperHub status and an independently gathered chain proof that agree with each other and with the intent. */
  const exactProof = (executionId: string) => {
    const receiptHash = hash32(`receipt-${executionId}`);
    return {
      status: {
        executionId,
        status: "completed",
        receipts: [
          { hash: receiptHash, chainId: String(BASE_SEPOLIA), verified: true, receiptStatus: "success" },
        ],
      },
      proof: {
        executionId,
        settlementId: PLAN_HASH,
        ledgerHash: LEDGER_HASH,
        contractAddress: CONTRACT_ADDRESS,
        chainId: String(BASE_SEPOLIA),
        verified: true,
        independent: { verified: true },
        receiptHashes: [receiptHash.toLowerCase()],
      },
    };
  };

  const observe = (overrides: ObservationOverrides = {}) => {
    const executionId = overrides.executionId ?? `exec_${digest(digest("intent")).slice(0, 24)}`;
    const exact = exactProof(executionId);
    const eventSeed = overrides.eventSeed ?? executionId;
    return database.query(
      `select state, revision from public.record_durable_settlement_observation(
         $1, $2, $3::boolean, $4, $5, $6::bigint, $7, $8, $9::jsonb, $10, $11::jsonb, $12, $13::timestamptz, $14)`,
      [
        executionId,
        PRINCIPAL,
        null,
        PLAN_HASH,
        LEDGER_HASH,
        BASE_SEPOLIA,
        CONTRACT_ADDRESS,
        overrides.state ?? "verified_settled",
        JSON.stringify(overrides.status ?? exact.status),
        digest(`status-${eventSeed}`),
        JSON.stringify(overrides.proof ?? exact.proof),
        digest(`proof-${eventSeed}`),
        new Date().toISOString(),
        digest(`observed-event-${eventSeed}`),
      ],
    );
  };

  const events = (idempotencyKey: string) =>
    database.query<{ revision: number; event_kind: string; state: string }>(
      `select revision, event_kind, state from public.settlement_submission_events
       where idempotency_key = $1 order by revision`,
      [idempotencyKey],
    );

  it("carries one submission from preparation to a verified settlement and journals every revision", async () => {
    const key = digest("lifecycle");
    const executionId = `exec_${digest(key).slice(0, 24)}`;

    await asServiceRole(async () => {
      const prepared = await prepare({ idempotencyKey: key });
      expect(prepared.rows[0]).toMatchObject({ state: "prepared", revision: 1 });
      // The plan hash and address are normalised on the way in, so a caller
      // cannot register the same settlement twice under different casing.
      expect(prepared.rows[0]).toMatchObject({
        plan_hash: PLAN_HASH.toLowerCase(),
        contract_address: CONTRACT_ADDRESS.toLowerCase(),
      });

      const accepted = await accept({ idempotencyKey: key });
      expect(accepted.rows[0]).toMatchObject({ state: "accepted", revision: 2, execution_id: executionId });

      const settled = await observe({ executionId });
      expect(settled.rows[0]).toMatchObject({ state: "verified_settled", revision: 3 });

      const journal = await events(key);
      expect(journal.rows).toEqual([
        { revision: 1, event_kind: "prepared", state: "prepared" },
        { revision: 2, event_kind: "accepted", state: "accepted" },
        { revision: 3, event_kind: "terminal", state: "verified_settled" },
      ]);
    });
  }, 60_000);

  it("replays preparation and acceptance without forking the journal", async () => {
    const key = digest("replay");

    await asServiceRole(async () => {
      await prepare({ idempotencyKey: key });
      const replayedPreparation = await prepare({ idempotencyKey: key });
      expect(replayedPreparation.rows[0]).toMatchObject({ state: "prepared", revision: 1 });

      await accept({ idempotencyKey: key });
      const replayedAcceptance = await accept({ idempotencyKey: key });
      expect(replayedAcceptance.rows[0]).toMatchObject({ state: "accepted", revision: 2 });

      const journal = await events(key);
      expect(journal.rows.map((row) => row.revision)).toEqual([1, 2]);
    });
  }, 60_000);

  it("refuses every journal function to a caller that is not the service role", async () => {
    const key = digest("unauthorized");

    // The GRANT layer denies first, before any function body runs, because the
    // migration revokes execute from anon and authenticated.
    for (const role of ["anon", "authenticated"] as const) {
      const denied = await asIdentity(database, { role, subject: randomUUID() }, () =>
        raisedBy(() => prepare({ idempotencyKey: key })),
      );
      expect(denied.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect(denied.message).toContain("permission denied for function prepare_durable_settlement_submission");
    }

    // And the body denies independently, so a caller that somehow holds execute
    // still cannot advance the journal without service-role claims. Here the
    // connection keeps its own privileges and only the claims change.
    await database.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ role: "authenticated", sub: randomUUID() }),
    ]);
    try {
      for (const call of [
        () => prepare({ idempotencyKey: key }),
        () => readRetry({ idempotencyKey: key }),
        () => accept({ idempotencyKey: key }),
        () => observe(),
      ]) {
        const raised = await raisedBy(call);
        expect(raised.code).toBe(RAISE_EXCEPTION);
        expect(raised.message).toBe("service role required");
      }
    } finally {
      await database.query("select set_config('request.jwt.claims', '', false)");
    }
  }, 60_000);

  it("keeps the journal tables unreadable to anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      for (const table of ["settlement_submission_intents", "settlement_submission_events"] as const) {
        const denied = await asIdentity(database, { role, subject: randomUUID() }, () =>
          raisedBy(() => database.query(`select 1 from public.${table}`)),
        );
        expect(denied.code).toBe(INSUFFICIENT_PRIVILEGE);
        expect(denied.message).toBe(`permission denied for table ${table}`);
      }
    }
  }, 60_000);

  it("rejects an approval that has expired or that reaches past the approval window", async () => {
    await asServiceRole(async () => {
      const expired = await raisedBy(() =>
        prepare({ idempotencyKey: digest("expired"), approvalExpiry: minutesFromNow(-1) }),
      );
      expect(expired.message).toBe("invalid durable submission binding");

      const overlong = await raisedBy(() =>
        prepare({ idempotencyKey: digest("overlong"), approvalExpiry: minutesFromNow(20) }),
      );
      expect(overlong.message).toBe("invalid durable submission binding");

      // The retry path re-checks the same window, so a stale approval cannot be
      // laundered into a fresh one by reading the intent back.
      const expiredRetry = await raisedBy(() =>
        readRetry({ idempotencyKey: digest("expired"), approvalExpiry: minutesFromNow(-1) }),
      );
      expect(expiredRetry.message).toBe("invalid durable retry binding");

      const overlongRetry = await raisedBy(() =>
        readRetry({ idempotencyKey: digest("overlong"), approvalExpiry: minutesFromNow(20) }),
      );
      expect(overlongRetry.message).toBe("invalid durable retry binding");
    });
  }, 60_000);

  it("rejects a preparation whose timestamp is outside the freshness window", async () => {
    await asServiceRole(async () => {
      for (const preparedAt of [minutesFromNow(-6), minutesFromNow(2)]) {
        const raised = await raisedBy(() => prepare({ idempotencyKey: digest(`stale-${preparedAt}`), preparedAt }));
        expect(raised.message).toBe("submission intent timestamp outside freshness window");
      }
    });
  }, 60_000);

  it("prepares only on a simulation that succeeded and would not revert", async () => {
    await asServiceRole(async () => {
      for (const simulation of [
        { success: false, wouldRevert: false },
        { success: true, wouldRevert: true },
        "not-an-object",
      ]) {
        const raised = await raisedBy(() =>
          prepare({ idempotencyKey: digest(`simulation-${JSON.stringify(simulation)}`), simulation }),
        );
        expect(raised.message).toBe("only a successful bounded exact simulation may be prepared");
      }
    });
  }, 60_000);

  it("refuses any chain other than Base Sepolia", async () => {
    await asServiceRole(async () => {
      const raised = await raisedBy(() => prepare({ idempotencyKey: digest("wrong-chain"), chainId: 1 }));
      expect(raised.message).toBe("only the Base Sepolia adapter is enabled");
    });
  }, 60_000);

  it("refuses a second execution id for an intent that is already accepted", async () => {
    const key = digest("double-execution");

    await asServiceRole(async () => {
      await prepare({ idempotencyKey: key });
      await accept({ idempotencyKey: key });

      const raised = await raisedBy(() => accept({ idempotencyKey: key, executionId: "exec_second_attempt" }));
      expect(raised.message).toBe("SUBMISSION_ACCEPTANCE_CONFLICT");

      const journal = await events(key);
      expect(journal.rows.map((row) => row.revision)).toEqual([1, 2]);
    });
  }, 60_000);

  it("refuses to store a row whose revision, state and evidence disagree", async () => {
    const key = digest("tampered-revision");
    await asServiceRole(() => prepare({ idempotencyKey: key }));

    // A privileged writer that is compromised or simply buggy still cannot
    // leave the journal in a shape the state machine never produces. These run
    // as the table owner, so nothing but the constraint itself is in the way.
    for (const tamper of [
      // A revision that has moved on while the state has not.
      "set revision = 2",
      // A state that has moved on with no execution recorded.
      "set state = 'accepted'",
      // A terminal state claimed without the proof that terminal states require.
      "set state = 'verified_settled', revision = 3",
    ]) {
      const raised = await raisedBy(() =>
        database.query(`update public.settlement_submission_intents ${tamper} where idempotency_key = $1`, [key]),
      );
      expect(raised.code).toBe(CHECK_VIOLATION);
      expect(raised.message).toContain("violates check constraint");
    }

    // The row is therefore still exactly what preparation left behind. This is
    // also why record_durable_settlement_acceptance's own revision guard cannot
    // be reached from here: the storage constraint forbids the disagreeing row
    // that the guard exists to reject, so the two gates cover each other.
    const intact = await database.query<{ state: string; revision: number }>(
      "select state, revision from public.settlement_submission_intents where idempotency_key = $1",
      [key],
    );
    expect(intact.rows[0]).toMatchObject({ state: "prepared", revision: 1 });
  }, 60_000);

  it("refuses to mark a settlement verified without exact matching chain proof", async () => {
    const key = digest("weak-proof");
    const executionId = `exec_${digest(key).slice(0, 24)}`;

    await asServiceRole(async () => {
      await prepare({ idempotencyKey: key });
      await accept({ idempotencyKey: key });

      const exact = exactProof(executionId);
      const unverifiedReceipt = {
        ...exact.status,
        receipts: [{ ...exact.status.receipts[0], verified: false }],
      };
      const revertedReceipt = {
        ...exact.status,
        receipts: [{ ...exact.status.receipts[0], receiptStatus: "reverted" }],
      };
      const unmatchedHashes = { ...exact.proof, receiptHashes: [hash32("some-other-receipt")] };
      const uncorroborated = { ...exact.proof, independent: { verified: false } };

      for (const attempt of [
        { status: unverifiedReceipt },
        { status: revertedReceipt },
        { proof: unmatchedHashes },
        { proof: uncorroborated },
      ]) {
        const raised = await raisedBy(() => observe({ executionId, ...attempt }));
        expect(raised.message).toBe("VERIFIED_SUBMISSION_REQUIRES_EXACT_CHAIN_PROOF");
      }

      // Nothing above moved the journal, so the settlement is still merely accepted.
      const journal = await events(key);
      expect(journal.rows.map((row) => row.revision)).toEqual([1, 2]);
    });
  }, 60_000);

  it("refuses proof that is not bound to the accepted execution", async () => {
    const key = digest("unbound-proof");
    const executionId = `exec_${digest(key).slice(0, 24)}`;

    await asServiceRole(async () => {
      await prepare({ idempotencyKey: key });
      await accept({ idempotencyKey: key });

      const exact = exactProof(executionId);
      for (const proof of [
        { ...exact.proof, settlementId: hash32("a-different-settlement") },
        { ...exact.proof, ledgerHash: hash32("a-different-ledger") },
        { ...exact.proof, executionId: "exec_someone_elses" },
        { ...exact.proof, receiptHashes: "not-an-array" },
      ]) {
        const raised = await raisedBy(() => observe({ executionId, proof }));
        expect(raised.message).toBe("SUBMISSION_PROOF_BINDING_MISMATCH");
      }
    });
  }, 60_000);

  it("refuses to reopen a settlement that already reached a failed terminal state", async () => {
    const key = digest("terminal-failed");
    const executionId = `exec_${digest(key).slice(0, 24)}`;

    await asServiceRole(async () => {
      await prepare({ idempotencyKey: key });
      await accept({ idempotencyKey: key });

      const exact = exactProof(executionId);
      const failure = {
        ...exact.status,
        status: "failed",
        receipts: [{ ...exact.status.receipts[0], receiptStatus: "reverted" }],
      };
      const failed = await observe({ executionId, state: "failed", status: failure, eventSeed: "failed" });
      expect(failed.rows[0]).toMatchObject({ state: "failed", revision: 3 });

      const raised = await raisedBy(() => observe({ executionId, eventSeed: "reopen" }));
      expect(raised.message).toBe("SUBMISSION_OBSERVATION_TRANSITION_REJECTED");
    });
  }, 60_000);

  it("authorises observation reads only for the principal the intent was prepared for", async () => {
    const key = digest("observation-access");
    const executionId = `exec_${digest(key).slice(0, 24)}`;

    await asServiceRole(async () => {
      await prepare({ idempotencyKey: key });
      await accept({ idempotencyKey: key });

      const access = (principal: string | null) =>
        database.query<{ authorized: boolean }>(
          `select public.assert_durable_settlement_observation_access(
             $1, $2, $3::boolean, $4, $5, $6::bigint, $7) as authorized`,
          [executionId, principal, null, PLAN_HASH, LEDGER_HASH, BASE_SEPOLIA, CONTRACT_ADDRESS],
        );

      const owner = await access(PRINCIPAL);
      expect(owner.rows[0]?.authorized).toBe(true);

      const stranger = await raisedBy(() => access(digest("a-different-principal")));
      expect(stranger.message).toBe("SUBMISSION_OBSERVATION_ACCESS_REJECTED");

      // Dropping the principal entirely is not a way around it: that path
      // demands an explicitly authorised capability.
      const anonymous = await raisedBy(() => access(null));
      expect(anonymous.message).toBe("invalid durable observation authority");
    });
  }, 60_000);
});
