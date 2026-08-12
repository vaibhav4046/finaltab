#!/usr/bin/env node
// Live production probe for the browser-facing half of the voice lifecycle.
//
// It answers the parts of issue #3 that do not require a signed-in session, and
// refuses to answer any of them vacuously:
//
//   1. Is the voice surface served to an anonymous visitor at all?
//   2. Does any permanent provider credential reach the browser?
//   3. Do the voice routes fail closed before they spend anything?
//
// Question 3 matters for cost as much as for security. `authorizeApiRequest`
// rejects an unauthenticated caller before `reserveDurableVoiceBudget` runs and
// before any provider fetch is issued, so this probe mints no AssemblyAI
// streaming session and triggers no ElevenLabs readback. It is free to run.
//
// The probe has two scopes because they prove different things and have
// different positive controls:
//
//   LIVE   — every asset an anonymous visitor can actually fetch from the
//            deployment, plus the route gate and the two API routes.
//   BUNDLE — the built client bundle, which is where the voice client code
//            lives. Production serves that chunk only behind the session gate,
//            so the credential question cannot be answered from the live scope.
//
// Each scope carries a control that must be satisfied before its "clean" result
// counts. Without one, an empty or misdirected scan reports a perfect pass:
// the first version of this probe followed a 307 to /auth, scanned the wrong
// page twice, and reported all detectors clean on code it had never read.
//
// Usage:
//   node scripts/probe-voice-surface.mjs [--base <url>] [--bundle <dir>] [--evidence <path>]
//
// ELEVENLABS_API_KEY, when present in the environment, upgrades the ElevenLabs
// check from shape-matching to an exact-value search. The key is never printed,
// never written to the artifact, and the writer refuses to emit a file that
// contains it.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (flag, fallback = null) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`${flag} needs a value.`);
    process.exit(2);
  }
  return value;
};

const base = (arg("--base", process.env.VOICE_PROBE_BASE_URL ?? "https://finaltab.vercel.app")).replace(/\/$/, "");
const bundleDir = arg("--bundle", "apps/web/.next/static");
const evidencePath = arg("--evidence");
const startedAt = new Date().toISOString();

const ROUTES = ["/", "/join", "/auth", "/developers", "/open-source"];
// The route that renders Lab -> SplitPanel -> VoiceTape. It is expected to be
// gated: an anonymous visitor must never be handed the voice chunk.
const GATED_VOICE_ROUTE = "/app/tab";

const failures = [];
const notes = [];

const fetchNoRedirect = async (url) => {
  const res = await fetch(url, {
    headers: { "user-agent": "finaltab-voice-surface-probe" },
    cache: "no-store",
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location"), body: await res.text() };
};

// ---------------------------------------------------------------------------
// Detectors, shared by both scopes.
//
// A bare 32-hex scan is useless here: webpack chunk hashes are 32-hex and
// appear everywhere. So the hex detector runs only inside a window around a
// provider mention, where a build hash has no reason to cluster.
// ---------------------------------------------------------------------------
const WINDOW = 400;

const windowedHex = (body, provider) => {
  const hits = [];
  for (const mention of body.matchAll(new RegExp(provider, "gi"))) {
    const start = Math.max(0, mention.index - WINDOW);
    const window = body.slice(start, mention.index + WINDOW);
    for (const hex of window.matchAll(/\b[0-9a-f]{32,}\b/g)) hits.push(`${hex[0].slice(0, 6)}...`);
  }
  return hits;
};

const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim();

const DETECTORS = [
  {
    name: "elevenlabs-direct-origin",
    why: "the browser must reach ElevenLabs only through the bounded server proxy",
    find: (body) => (body.includes("api.elevenlabs.io") ? ["api.elevenlabs.io"] : []),
  },
  {
    name: "assemblyai-token-mint-endpoint",
    why: "minting a temporary token requires the permanent key, so that call must never be client-side",
    find: (body) => (body.includes("streaming.eu.assemblyai.com/v3/token") ? ["/v3/token"] : []),
  },
  {
    name: "provider-key-header",
    why: "xi-api-key is the header that carries the permanent ElevenLabs key",
    find: (body) => (body.includes("xi-api-key") ? ["xi-api-key"] : []),
  },
  {
    name: "provider-key-env-name",
    why: "a server-only variable appearing client-side means it was inlined into the bundle",
    find: (body) => ["ASSEMBLYAI_API_KEY", "ELEVENLABS_API_KEY"].filter((name) => body.includes(name)),
  },
  {
    name: "elevenlabs-key-shape",
    why: "ElevenLabs keys are sk_ followed by a long hex run",
    find: (body) => [...body.matchAll(/\bsk_[0-9a-f]{32,}\b/gi)].map((m) => `${m[0].slice(0, 6)}...`),
  },
  {
    name: "hex-secret-near-assemblyai",
    why: "an AssemblyAI key is 32 hex; near the provider name that is not a build hash",
    find: (body) => windowedHex(body, "assemblyai"),
  },
  {
    name: "hex-secret-near-elevenlabs",
    why: "same test for the readback provider",
    find: (body) => windowedHex(body, "elevenlabs"),
  },
];

if (elevenLabsKey) {
  DETECTORS.push({
    name: "elevenlabs-key-exact-value",
    why: "the strongest form of this check: the literal configured key",
    find: (body) => (body.includes(elevenLabsKey) ? ["EXACT_KEY_PRESENT"] : []),
  });
} else {
  notes.push("ELEVENLABS_API_KEY absent from the environment; the ElevenLabs check ran by shape, not by exact value");
}
notes.push("ASSEMBLYAI_API_KEY absent from the environment; the AssemblyAI check ran structurally, not by exact value");

const runDetectors = (scope, files) =>
  DETECTORS.map((detector) => {
    const offenders = [];
    for (const file of files) {
      const hits = detector.find(file.body);
      if (hits.length > 0) offenders.push({ file: file.name, hits: [...new Set(hits)] });
    }
    if (offenders.length > 0) {
      failures.push(`${scope}/${detector.name}: ${offenders.length} file(s) carry provider credential material`);
    }
    return { name: detector.name, why: detector.why, offenders };
  });

// ---------------------------------------------------------------------------
// Scope 1: LIVE. What an anonymous visitor can actually fetch.
// ---------------------------------------------------------------------------
const routeStatus = [];
const assetUrls = new Set();

for (const route of ROUTES) {
  const { status, location, body } = await fetchNoRedirect(`${base}${route}`);
  routeStatus.push({ route, status, location, bytes: body.length });
  if (status !== 200) {
    notes.push(`route ${route} returned ${status}; its assets were not scanned`);
    continue;
  }
  for (const match of body.matchAll(/\/_next\/static\/[^"'\\\s)]+?\.(?:js|css)/g)) {
    assetUrls.add(`${base}${match[0]}`);
  }
}

// The gate itself is a finding: the voice chunk must not be served anonymously.
const gate = await fetchNoRedirect(`${base}${GATED_VOICE_ROUTE}`);
const gateRedirectsToAuth = gate.status >= 300 && gate.status < 400 && (gate.location ?? "").includes("/auth");
if (!gateRedirectsToAuth) {
  failures.push(
    `${GATED_VOICE_ROUTE} did not redirect an anonymous visitor to /auth (got ${gate.status} ${gate.location ?? ""})`,
  );
}

// The webpack runtime maps chunk ids to filenames, which reaches lazily loaded
// chunks that no page's HTML references directly.
const seedAssets = [...assetUrls];
for (const url of seedAssets) {
  if (!/\/webpack-[^/]+\.js$/.test(url)) continue;
  const { status, body } = await fetchNoRedirect(url);
  if (status !== 200) continue;
  for (const match of body.matchAll(/static\/chunks\/[^"'\\\s)]+?\.js/g)) {
    assetUrls.add(`${base}/_next/${match[0]}`);
  }
}

const liveFiles = [];
let liveBytes = 0;
for (const url of assetUrls) {
  const { status, body } = await fetchNoRedirect(url);
  if (status !== 200) {
    notes.push(`asset ${url.replace(base, "")} returned ${status}`);
    continue;
  }
  liveFiles.push({ name: url.replace(base, ""), body });
  liveBytes += body.length;
}

// Control: a live scan that fetched almost nothing would report every detector
// clean. Require a real corpus before believing the absences.
const liveControls = [
  { name: "assets-fetched", ok: liveFiles.length >= 5, detail: `${liveFiles.length} files` },
  { name: "bytes-scanned", ok: liveBytes >= 200_000, detail: `${liveBytes} bytes` },
];
for (const control of liveControls) {
  if (!control.ok) failures.push(`live control "${control.name}" not satisfied (${control.detail})`);
}

const liveDetectors = runDetectors("live", liveFiles);
const voiceReachableAnonymously = liveFiles.some((file) => file.body.includes("streaming.eu.assemblyai.com"));
if (voiceReachableAnonymously) {
  failures.push("the voice client is reachable anonymously; the /app gate is not holding");
}

// ---------------------------------------------------------------------------
// Scope 2: BUNDLE. The built client code, including the gated route chunk.
// ---------------------------------------------------------------------------
const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (/\.(?:js|css)$/.test(entry.name)) out.push(path);
  }
  return out;
};

let bundleFiles = [];
let bundleBytes = 0;
try {
  for (const path of walk(bundleDir)) {
    const body = readFileSync(path, "utf8");
    bundleFiles.push({ name: path.replace(/\\/g, "/"), body });
    bundleBytes += body.length;
  }
} catch (error) {
  failures.push(`bundle scope unavailable: ${error.message}. Run \`pnpm build\` first.`);
  bundleFiles = [];
}

// Control: this scope exists to inspect the voice client, so the voice client
// must be in it. Without these three markers a clean result means the scan
// missed the code, not that the code is clean.
const BUNDLE_CONTROLS = [
  { name: "approved-websocket-host", needle: "streaming.eu.assemblyai.com" },
  { name: "approved-websocket-path", needle: "/v3/ws" },
  { name: "voice-token-route", needle: "/api/voice/token" },
];
const bundleControls = BUNDLE_CONTROLS.map((control) => {
  const hits = bundleFiles.filter((file) => file.body.includes(control.needle)).length;
  if (hits === 0) {
    failures.push(`bundle control "${control.name}" absent: the scan never reached the voice client, so it proves nothing`);
  }
  return { ...control, filesContaining: hits };
});

const bundleDetectors = runDetectors("bundle", bundleFiles);

// ---------------------------------------------------------------------------
// Scope 3: fail-closed route probes. Unauthenticated, therefore free.
// ---------------------------------------------------------------------------
const routeProbes = [];
const probeRoute = async (path, init, expectStatus, expectError) => {
  const res = await fetch(`${base}${path}`, { ...init, cache: "no-store", redirect: "manual" });
  const body = await res.text();
  let error = "";
  try {
    error = JSON.parse(body).error ?? "";
  } catch {
    error = "";
  }
  const leaked = /\bsk_[0-9a-f]{32,}\b/i.test(body) || (elevenLabsKey ? body.includes(elevenLabsKey) : false);
  const ok = res.status === expectStatus && (expectError === null || error === expectError) && !leaked;
  if (!ok) {
    failures.push(
      `${init.method} ${path}: expected ${expectStatus}${expectError ? ` ${expectError}` : ""}, got ${res.status} ${error || "(no error field)"}${leaked ? " and the body carried key-shaped material" : ""}`,
    );
  }
  routeProbes.push({
    method: init.method,
    path,
    status: res.status,
    error,
    wwwAuthenticate: res.headers.get("www-authenticate") ?? null,
    bodyCarriedKeyMaterial: leaked,
    expected: { status: expectStatus, error: expectError },
    ok,
  });
};

// No body on the token route: it rejects even a chunked body, and the 401
// lands before that check anyway.
await probeRoute("/api/voice/token", { method: "POST" }, 401, "AUTH_REQUIRED");
await probeRoute(
  "/api/voice/speak",
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "probe" }) },
  401,
  "AUTH_REQUIRED",
);

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
const printScope = (label, controls, detectors, summary) => {
  console.log(`\n${label}  ${summary}`);
  for (const control of controls) {
    const ok = "ok" in control ? control.ok : control.filesContaining > 0;
    console.log(`  ${ok ? "control" : "MISSING"} ${control.name.padEnd(28)} ${control.detail ?? `${control.filesContaining} file(s)`}`);
  }
  for (const detector of detectors) {
    console.log(`  ${detector.offenders.length === 0 ? "clean  " : "LEAK   "} ${detector.name}`);
    for (const offender of detector.offenders) console.log(`           ${offender.file} ${offender.hits.join(" ")}`);
  }
};

console.log(`voice surface probe -> ${base}`);
console.log(`\nroutes  ${routeStatus.map((r) => `${r.route} ${r.status}`).join(", ")}`);
console.log(`gate    ${GATED_VOICE_ROUTE} ${gate.status} -> ${gate.location ?? "(no redirect)"} ${gateRedirectsToAuth ? "[session required]" : "[UNGATED]"}`);
printScope("LIVE  ", liveControls, liveDetectors, `${liveFiles.length} files, ${liveBytes.toLocaleString()} bytes an anonymous visitor can fetch`);
console.log(`  ${voiceReachableAnonymously ? "OPEN   " : "gated  "} voice client not served anonymously`);
printScope("BUNDLE", bundleControls, bundleDetectors, `${bundleFiles.length} files, ${bundleBytes.toLocaleString()} bytes in ${bundleDir}`);
console.log("\nfail-closed route probes");
for (const probe of routeProbes) {
  console.log(`  ${probe.ok ? "closed " : "OPEN   "} ${probe.method} ${probe.path.padEnd(22)} ${probe.status} ${probe.error}`);
}
if (notes.length > 0) {
  console.log("\nlimits of this run");
  for (const note of notes) console.log(`  - ${note}`);
}

if (evidencePath) {
  const evidence = {
    tool: "probe-voice-surface",
    version: 2,
    startedAt,
    mode: "read-only",
    baseUrl: base,
    bundleDir,
    routes: routeStatus,
    gate: { route: GATED_VOICE_ROUTE, status: gate.status, location: gate.location, redirectsToAuth: gateRedirectsToAuth },
    live: {
      filesScanned: liveFiles.length,
      bytesScanned: liveBytes,
      controls: liveControls,
      detectors: liveDetectors,
      voiceClientReachableAnonymously: voiceReachableAnonymously,
    },
    bundle: {
      filesScanned: bundleFiles.length,
      bytesScanned: bundleBytes,
      controls: bundleControls,
      detectors: bundleDetectors,
    },
    routeProbes,
    limits: notes,
    // Recorded so the artifact cannot be re-read as proof of more than it is.
    provenHere: [
      "the voice surface is not served to an anonymous visitor",
      "no permanent provider credential is present in the built client bundle",
      "both voice routes reject an unauthenticated caller before any provider call or budget reservation",
    ],
    notProvenHere: [
      "microphone capture and the AssemblyAI streaming lifecycle",
      "abort and reconnect UI states",
      "durable quota reservation and concurrency behaviour",
      "the temporary-token response shape, which requires a session",
    ],
    providerSessionsMinted: 0,
    providerCharges: 0,
    finishedAt: new Date().toISOString(),
    verdict: failures.length === 0 ? "NO_PERMANENT_CREDENTIAL_REACHES_THE_BROWSER" : "VOICE_SURFACE_PROBE_FAILED",
    failures,
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (elevenLabsKey && serialized.includes(elevenLabsKey)) {
    console.error("\nrefusing to write evidence: the serialized artifact contains the key.");
    process.exit(2);
  }
  writeFileSync(evidencePath, serialized);
  console.log(`\nevidence -> ${evidencePath}`);
}

if (failures.length > 0) {
  console.error("\nfailures:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log("\nno permanent provider credential reaches the browser; the voice surface is gated and both routes fail closed");
