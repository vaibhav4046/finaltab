import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Every other test in this suite mocks the Supabase client, so an RPC name or an
// argument name can drift away from the migration that declares it and no test
// notices. PostgREST resolves a function by its argument *names*: a body whose
// keys do not match a declared signature returns `404 PGRST202` against the
// schema cache, never reaching Postgres. That failure is invisible until a real
// request hits production, which makes it exactly the undeclared-dependency
// class this file exists to close. Nothing here talks to a database — it reads
// the call sites out of the server source and the signatures out of the
// migrations, and requires them to agree.

const webRoot = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
const migrationsDir = fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// `.rpc(functionName, args)` cannot be resolved statically. Each entry below is
// a typed forwarder whose own literal call sites are scanned, so the names still
// get checked; a new dynamic call site outside this list fails the test.
const DYNAMIC_DISPATCH_ALLOWLIST = [
  { file: "lib/server/v3NarrationGenerationStore.ts", forwarder: "rpcRow" },
];

type SqlParameter = { name: string; optional: boolean };
type CallSite = { file: string; line: number; name: string; args: string[] };

const splitTopLevel = (source: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of source) {
    if ("{[(".includes(char)) depth += 1;
    else if ("}])".includes(char)) depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) parts.push(current);
  return parts;
};

/** Key of an object-literal property, before any ternary `:` in its value. */
const propertyKey = (segment: string): string => {
  let depth = 0;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if ("{[(".includes(char)) depth += 1;
    else if ("}])".includes(char)) depth -= 1;
    else if (char === ":" && depth === 0) return segment.slice(0, index).trim();
  }
  return segment.trim(); // shorthand property
};

const sourceFiles = (dir: string, found: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "test") continue;
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
};

const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(`${migrationsDir}/${file}`, "utf8"))
  .join("\n");

// Applied in filename order, so a later `create or replace` wins — the same
// resolution the deployed database performs.
const declaredFunctions = new Map<string, SqlParameter[]>(
  [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns\s/gi)].map(
    (match) => [
      match[1],
      splitTopLevel(match[2])
        .map((parameter) => parameter.trim())
        .filter(Boolean)
        .map((parameter) => ({
          name: parameter.split(/\s+/)[0],
          optional: /\sdefault\s/i.test(parameter),
        })),
    ],
  ),
);

const callSites: CallSite[] = [];
const dynamicSites: { file: string; line: number }[] = [];
const unresolved: string[] = [];

for (const file of sourceFiles(webRoot)) {
  const relative = file.slice(webRoot.length + 1);
  const source = readFileSync(file, "utf8");
  const pattern = /(?:\.rpc|\brpcRow)\(\s*(?:"([a-z0-9_]+)"|([A-Za-z_$][\w$]*))\s*(,|\))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const line = source.slice(0, match.index).split("\n").length;
    if (match[2]) {
      dynamicSites.push({ file: relative, line });
      continue;
    }
    if (match[3] === ")") {
      callSites.push({ file: relative, line, name: match[1], args: [] });
      continue;
    }
    const rest = source.slice(pattern.lastIndex);
    const literal = /^\s*\{/.exec(rest);
    if (!literal) {
      unresolved.push(`${relative}:${line} ${match[1]} was passed a non-literal argument object`);
      continue;
    }
    const open = pattern.lastIndex + literal[0].length - 1;
    let depth = 0;
    let close = open;
    for (; close < source.length; close += 1) {
      if (source[close] === "{") depth += 1;
      else if (source[close] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const args = splitTopLevel(source.slice(open + 1, close)).map(propertyKey).filter(Boolean);
    callSites.push({ file: relative, line, name: match[1], args });
  }
}

describe("supabase rpc contracts", () => {
  it("parses every call site into plain argument identifiers", () => {
    // Fail-closed guard on the scanner itself: a comment or an expression the
    // splitter mishandles shows up as a non-identifier key rather than quietly
    // reducing the checks below to nothing.
    const malformed = callSites
      .flatMap((site) => site.args.map((arg) => ({ site, arg })))
      .filter(({ arg }) => !IDENTIFIER.test(arg))
      .map(({ site, arg }) => `${site.file}:${site.line} ${site.name} -> ${arg}`);
    expect(malformed).toEqual([]);
    expect(unresolved).toEqual([]);
    expect(callSites.length).toBeGreaterThanOrEqual(28);
    expect(declaredFunctions.size).toBe(31);
  });

  it("calls only functions the migrations declare", () => {
    const undeclared = callSites
      .filter((site) => !declaredFunctions.has(site.name))
      .map((site) => `${site.file}:${site.line} ${site.name}`);
    expect(undeclared).toEqual([]);
  });

  it("sends no argument the declared signature does not accept", () => {
    const unknown = callSites.flatMap((site) => {
      const declared = declaredFunctions.get(site.name);
      if (!declared) return [];
      const names = new Set(declared.map((parameter) => parameter.name));
      return site.args
        .filter((arg) => !names.has(arg))
        .map((arg) => `${site.file}:${site.line} ${site.name}(${arg})`);
    });
    expect(unknown).toEqual([]);
  });

  it("supplies every parameter that has no default", () => {
    const missing = callSites.flatMap((site) => {
      const declared = declaredFunctions.get(site.name);
      if (!declared) return [];
      const sent = new Set(site.args);
      return declared
        .filter((parameter) => !parameter.optional && !sent.has(parameter.name))
        .map((parameter) => `${site.file}:${site.line} ${site.name} omits ${parameter.name}`);
    });
    expect(missing).toEqual([]);
  });

  it("routes dynamic dispatch through the documented forwarders only", () => {
    expect(dynamicSites.map((site) => site.file).sort()).toEqual(
      DYNAMIC_DISPATCH_ALLOWLIST.map((entry) => entry.file).sort(),
    );
    for (const entry of DYNAMIC_DISPATCH_ALLOWLIST) {
      const forwarded = callSites.filter((site) => site.file === entry.file);
      expect(forwarded.length).toBeGreaterThan(0);
    }
  });
});
