#!/usr/bin/env node
// Live authorization probe for the anonymous browser role.
//
// Reads the table and function inventory straight out of supabase/migrations so
// it can never drift from the schema, then asks the deployed PostgREST endpoint
// for each one using the same publishable key every visitor's browser already
// holds. Nothing here is a secret and nothing here mutates: every uuid argument
// is the nil uuid, so a function body that somehow did execute could not match a
// real row.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//   node scripts/probe-anon-authorization.mjs [--evidence <path>]
//
// With --evidence the run is retained as JSON. The key is browser-public, but
// "public" is not a reason to write it into a committed file, so the writer
// refuses to emit an artifact that contains it rather than trusting that no
// field happens to carry it.
//
// Fails closed: anything that is not an explicit `42501 permission denied` is
// reported and exits non-zero. That covers the obvious case (a surface the
// anonymous role can actually reach) and one more besides — a migration that was
// committed but never applied answers `PGRST205 not found`, so drift between the
// migrations and the deployed database shows up here too.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

const evidenceFlag = process.argv.indexOf("--evidence");
const evidencePath = evidenceFlag === -1 ? null : process.argv[evidenceFlag + 1];
if (evidenceFlag !== -1 && !evidencePath) {
  console.error("--evidence needs a path.");
  process.exit(2);
}
const startedAt = new Date().toISOString();

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (both are browser-public values).");
  process.exit(2);
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const DENIED = "42501";

const migrationsDir = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(`${migrationsDir}/${file}`, "utf8"))
  .join("\n");

const tables = [
  ...new Set(
    [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi)].map((m) => m[1]),
  ),
].sort();

// Signatures are needed verbatim: PostgREST resolves an RPC by argument names,
// so a call with the wrong shape 404s on the schema cache before Postgres ever
// evaluates EXECUTE privilege. A 404 would look like a pass and prove nothing.
const functions = [
  ...new Map(
    [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([^)]*)\)\s*returns\s+(\S+)/gi)]
      .filter((m) => !/^trigger$/i.test(m[3]))
      .map((m) => [
        m[1],
        m[2]
          .replace(/\s+default\s+[^,]+/gi, "")
          .split(",")
          .map((arg) => arg.trim())
          .filter(Boolean)
          .map((arg) => {
            const parts = arg.split(/\s+/);
            return { name: parts[0], type: parts.slice(1).join(" ") };
          }),
      ]),
  ),
].sort(([a], [b]) => a.localeCompare(b));

const dummy = (type) => {
  const t = type.toLowerCase();
  if (t.startsWith("uuid")) return NIL_UUID;
  if (t.startsWith("json")) return {};
  if (t.startsWith("timestamp")) return "2026-01-01T00:00:00Z";
  if (t.startsWith("bigint") || t.startsWith("integer") || t.startsWith("smallint")) return 0;
  if (t.startsWith("boolean")) return false;
  if (t.startsWith("bytea")) return "\\x00";
  return "probe";
};

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const read = async (path, init) => {
  const res = await fetch(`${url}${path}`, { ...init, headers });
  const text = await res.text();
  let code = "";
  try {
    code = JSON.parse(text).code ?? "";
  } catch {
    code = "";
  }
  return { status: res.status, code, text };
};

const failures = [];
const surfaces = [];
let checked = 0;

console.log(`anonymous authorization probe -> ${url}\n`);
console.log(`tables (${tables.length})`);
for (const table of tables) {
  const { status, code } = await read(`/rest/v1/${table}?select=*&limit=1`, { method: "GET" });
  const denied = code === DENIED;
  checked += 1;
  if (!denied) failures.push(`table ${table} reachable: ${status} ${code}`);
  surfaces.push({ kind: "table", name: table, status, code, denied });
  console.log(`  ${denied ? "denied " : "OPEN   "} ${table.padEnd(38)} ${status} ${code}`);
}

console.log(`\nfunctions (${functions.length})`);
for (const [name, args] of functions) {
  const body = Object.fromEntries(args.map((arg) => [arg.name, dummy(arg.type)]));
  const { status, code } = await read(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  const denied = code === DENIED;
  checked += 1;
  if (!denied) failures.push(`function ${name} reachable: ${status} ${code}`);
  surfaces.push({ kind: "function", name, args: args.length, status, code, denied });
  console.log(`  ${denied ? "denied " : "OPEN   "} ${name.padEnd(46)} args=${String(args.length).padStart(2)} ${status} ${code}`);
}

console.log(`\n${checked - failures.length}/${checked} denied to the anonymous role`);

if (evidencePath) {
  const evidence = {
    tool: "probe-anon-authorization",
    version: 1,
    startedAt,
    mode: "read-only",
    evidenceFile: evidencePath,
    supabaseUrl: url,
    role: "anon",
    deniedCode: DENIED,
    counts: {
      tables: tables.length,
      functions: functions.length,
      checked,
      denied: checked - failures.length,
    },
    surfaces,
    finishedAt: new Date().toISOString(),
    verdict: failures.length === 0 ? "ANON_DENIED_EVERY_SURFACE" : "ANON_REACHED_A_SURFACE",
    failedSurfaces: failures,
    // A probe that mutated nothing is the only kind whose evidence can be
    // re-read as proof of the boundary rather than proof of a side effect.
    rowsRead: 0,
    rowsWritten: 0,
    sessionTokensStored: false,
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (serialized.includes(key)) {
    console.error("\nrefusing to write evidence: the serialized artifact contains the key.");
    process.exit(2);
  }
  writeFileSync(evidencePath, serialized);
  console.log(`evidence -> ${evidencePath}`);
}

if (failures.length > 0) {
  console.error("\nreachable surfaces:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log("anonymous role holds no read or execute privilege on the public schema");
