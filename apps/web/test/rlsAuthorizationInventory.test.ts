import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The other migration tests pin specific policy text in specific files. This one
// is structural: it walks every migration and fails when a NEW table or function
// arrives without the authorization it needs. A table created without RLS, or a
// SECURITY DEFINER function left with Postgres' default PUBLIC execute, is the
// exact shape of regression these assertions exist to catch.

const migrationsDir = fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));

const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(`${migrationsDir}/${file}`, "utf8"))
  .join("\n");

const matchAll = (pattern: RegExp): string[][] => [...sql.matchAll(pattern)].map((match) => [...match]);

const createdTables = new Set(
  matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi).map((m) => m[1]),
);

const rlsEnabled = new Set(
  matchAll(/alter\s+table\s+(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi).map((m) => m[1]),
);

// Trigger functions are only reachable through the triggers that own them;
// PostgREST cannot expose a function returning `trigger`.
const publicFunctions = matchAll(
  /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\([^)]*\)\s*returns\s+(\S+)/gi,
);

const callablePublicFunctions = new Set(
  publicFunctions.filter((m) => !/^trigger$/i.test(m[2])).map((m) => m[1]),
);

const revokedFunctions = new Set(
  matchAll(/revoke\s+all\s+on\s+function\s+public\.([a-z0-9_]+)/gi).map((m) => m[1]),
);

describe("database authorization inventory", () => {
  it("enables row level security on every table the migrations create", () => {
    const missing = [...createdTables].filter((table) => !rlsEnabled.has(table)).sort();
    expect(missing).toEqual([]);
    expect(createdTables.size).toBe(31);
  });

  it("revokes the default PUBLIC execute from every callable public function", () => {
    const missing = [...callablePublicFunctions].filter((fn) => !revokedFunctions.has(fn)).sort();
    expect(missing).toEqual([]);
    expect(callablePublicFunctions.size).toBe(30);
  });

  it("keeps the private helper schema away from browser roles", () => {
    expect(sql).toContain("revoke all on schema private from public, anon, authenticated");
  });

  it("never grants a policy or table privilege to the anonymous role", () => {
    expect(sql).not.toMatch(/\bto\s+anon\b/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
});
