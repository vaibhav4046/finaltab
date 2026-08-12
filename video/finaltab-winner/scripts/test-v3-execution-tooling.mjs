import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizedWords, scriptNarrationLines, words } from "./v3-tooling.mjs";
import {
  ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER,
  countElevenLabsNarrationCharacters,
  getElevenLabsQuotaPreflight,
  runQuotaGuardedElevenLabsSynthesis,
} from "./elevenlabs-quota-guard.mjs";
import {
  loadRuntimeNarrationCapability,
  reconcileRuntimeNarrationArtifacts,
  RUNTIME_NARRATION_CONTRACT,
  verifyRuntimeAudioResponse,
} from "./runtime-narration-runner-lib.mjs";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(projectDir, ...path.split("/")));
const hash = (value) => createHash("sha256").update(value).digest("hex");

function run(command, args) {
  return spawnSync(command, args, { cwd: projectDir, encoding: "utf8", windowsHide: true });
}

const safeQuotaFactKeys = [
  "currentOverageIsZero",
  "exactNarrationCharacters",
  "extensionOrOverageAvailable",
  "hasOpenInvoices",
  "httpStatus",
  "paymentPendingOrFailed",
  "reasonCode",
  "remainingIncludedCharacters",
  "requiredIncludedCharacters",
  "result",
  "safetyMultiplier",
  "sanitized",
  "subscriptionActive",
].sort();

const mockSubscription = (overrides = {}) => ({
  character_count: 100,
  character_limit: 10_000,
  max_credit_limit_extension: 0,
  can_extend_character_limit: false,
  current_overage: { amount: "0", currency: "usd" },
  status: "active",
  open_invoices: [],
  has_open_invoices: false,
  next_invoice: null,
  ...overrides,
});

async function runMockQuotaScenario({
  subscription = mockSubscription(),
  getStatus = 200,
  getFailure = false,
  jsonFailure = false,
} = {}) {
  const calls = [];
  let recordedFacts;
  const fetchImpl = async (url, options) => {
    calls.push({ method: options.method, redirect: options.redirect, url: String(url) });
    if (options.method === "GET") {
      if (getFailure) throw new Error("mock subscription transport failure with sensitive detail");
      if (getStatus !== 200) return { ok: false, status: getStatus };
      return {
        ok: true,
        status: 200,
        async json() {
          if (jsonFailure) throw new Error("mock raw payload parser failure");
          return subscription;
        },
      };
    }
    return { ok: true, status: 200 };
  };

  const result = await runQuotaGuardedElevenLabsSynthesis({
    fetchImpl,
    apiKey: "mock-secret-api-key",
    narration: "Exact mock narration.",
    modelId: "eleven_multilingual_v2",
    synthesisEndpoint: "https://api.elevenlabs.io/v1/text-to-speech/mock-voice",
    onPreflight(facts) {
      recordedFacts = facts;
    },
  });
  return { calls, recordedFacts, result };
}

function assertDeniedWithoutPost(scenario, reasonCode) {
  assert.equal(scenario.result.preflight.allowed, false);
  assert.equal(scenario.result.preflight.facts.reasonCode, reasonCode);
  assert.equal(scenario.result.response, null);
  assert.deepEqual(scenario.calls.map((call) => call.method), ["GET"]);
  assert.equal(scenario.recordedFacts.sanitized, true);
  assert.deepEqual(Object.keys(scenario.recordedFacts).sort(), safeQuotaFactKeys);
  assert.doesNotMatch(JSON.stringify(scenario.recordedFacts), /mock-secret|sensitive detail|raw payload|open_invoices|payment_intent_status|currency|tier/u);
}

test("frozen V3 source contract remains byte-identical", () => {
  assert.equal(hash(read("data/v3-source-contract.json")), "9a78de1d4226b3df3859a5ab5bd2946762157b05de1ab4df65248fe25a53ab0f");
});

test("script and local contract contain the same exact 183-word sequence", () => {
  const script = read("SCRIPT.md").toString("utf8");
  const contract = JSON.parse(read("data/v3-source-contract.json"));
  const lines = scriptNarrationLines(script);
  assert.equal(lines.length, 8);
  assert.equal(words(lines.join(" ")).length, 183);
  assert.equal(contract.wordCount, 183);
  assert.deepEqual(lines, contract.scenes.map((scene) => scene.narration));
  assert.deepEqual(normalizedWords(lines.join(" ")), normalizedWords(contract.scenes.map((scene) => scene.narration).join(" ")));
  assert.equal(contract.narration.provider, "Kokoro-82M (local)");
  assert.equal(contract.narration.model, "kokoro-v1.0");
  assert.equal(contract.narration.voiceId, "bm_george");
  assert.equal(contract.narration.providerCallsRequired, 0);
});

test("local voice and capture contract checks are dry and mutation-free by default", () => {
  const tracked = [
    "data/voiceover-manifest.json",
    "data/narration-generation-ledger.json",
    "data/capture-lock.json",
    "data/release-proof.json",
  ];
  const before = Object.fromEntries(tracked.map((path) => [path, hash(read(path))]));
  const voice = run(process.execPath, ["scripts/sync-route-voice-manifest.mjs"]);
  assert.equal(voice.status, 0, voice.stderr);
  assert.match(voice.stdout, /VOICE PACKAGE CONTRACT PASSED/u);
  const capture = run(process.execPath, ["capture-evidence.mjs"]);
  assert.equal(capture.status, 0, capture.stderr);
  assert.match(capture.stdout, /no browser, network, MCP, wallet, or value action/u);
  assert.deepEqual(Object.fromEntries(tracked.map((path) => [path, hash(read(path))])), before);
});

test("active package exposes only local narration generation and verification", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.scripts["voice:generate"], "node scripts/generate-local-narration.mjs");
  assert.equal(packageJson.scripts["voice:local:generate"], "node scripts/generate-local-narration.mjs");
  assert.equal(packageJson.scripts["voice:check"], "node scripts/sync-route-voice-manifest.mjs");
  for (const retiredScript of ["voice:preflight", "voice:runtime:preflight", "voice:runtime:generate", "voice:align"]) {
    assert.equal(packageJson.scripts[retiredScript], undefined);
  }
  const generatorSource = read("scripts/generate-local-narration.mjs").toString("utf8");
  assert.match(generatorSource, /HF_HUB_OFFLINE/u);
  assert.match(generatorSource, /TRANSFORMERS_OFFLINE/u);
  assert.match(generatorSource, /ttsProviderCallsAllowed:\s*0/u);
});

test("preflight-only primitive cannot make a synthesis POST even when included quota is sufficient", async () => {
  const calls = [];
  const preflight = await getElevenLabsQuotaPreflight({
    fetchImpl: async (url, options) => {
      calls.push({ method: options.method, url: String(url) });
      return { ok: true, status: 200, async json() { return mockSubscription(); } };
    },
    apiKey: "mock-secret-api-key",
    narration: "Exact mock narration.",
  });
  assert.equal(preflight.allowed, true);
  assert.deepEqual(calls.map((call) => call.method), ["GET"]);
});

test("local alignment and caption source enforce exact-safe contracts", () => {
  const alignment = JSON.parse(read("assets/audio/voice-v3/finaltab-v3-local-kokoro-alignment.json"));
  assert.equal(alignment.schemaVersion, 3);
  assert.equal(alignment.status, "approved-v3-alignment");
  assert.equal(alignment.timingMapping.method, "local-kokoro-known-source-proportional-v1");
  assert.equal(alignment.timingMapping.lockedWordCount, 183);
  assert.equal(alignment.timingMapping.mappedWordCount, 183);
  assert.equal(alignment.timingMapping.fullMonotonicMapping, true);
  assert.equal(alignment.scenes.length, 8);
  assert.equal(alignment.scenes.flatMap((scene) => scene.words).length, 183);
  assert.equal(alignment.scenes.every((scene) => scene.atempoFactor >= 1 && scene.atempoFactor <= 1.24), true);
  const captions = read("build-captions.mjs").toString("utf8");
  assert.match(captions, /data-layout-allow-caption-zone/u);
  assert.doesNotMatch(captions, /translateX\s*\(/u);
  assert.doesNotMatch(captions, /join\(["']<br/u);
});

test("ElevenLabs quota guard allows one POST only when conservative included quota is sufficient", async () => {
  const scenario = await runMockQuotaScenario();
  assert.equal(scenario.result.preflight.allowed, true);
  assert.deepEqual(scenario.calls.map((call) => call.method), ["GET", "POST"]);
  assert.deepEqual(scenario.calls.map((call) => call.redirect), ["error", "error"]);
  assert.deepEqual(scenario.calls.map((call) => call.url), [
    "https://api.elevenlabs.io/v1/user/subscription",
    "https://api.elevenlabs.io/v1/text-to-speech/mock-voice",
  ]);
  assert.equal(scenario.recordedFacts.result, "approved");
  assert.deepEqual(Object.keys(scenario.recordedFacts).sort(), safeQuotaFactKeys);
  assert.equal(scenario.recordedFacts.safetyMultiplier, ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER);
  assert.equal(
    scenario.recordedFacts.requiredIncludedCharacters,
    Math.ceil(countElevenLabsNarrationCharacters("Exact mock narration.") * ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER),
  );
});

test("ElevenLabs quota guard accepts the sufficient official aggregate field set", async () => {
  const scenario = await runMockQuotaScenario({
    subscription: {
      character_count: 100,
      character_limit: 10_000,
      max_credit_limit_extension: 0,
      can_extend_character_limit: false,
      current_overage: { amount: "0" },
      status: "active",
      has_open_invoices: false,
    },
  });
  assert.equal(scenario.result.preflight.allowed, true);
  assert.deepEqual(scenario.calls.map((call) => call.method), ["GET", "POST"]);
});

test("ElevenLabs quota guard denies insufficient base quota with zero POST", async () => {
  const scenario = await runMockQuotaScenario({
    subscription: mockSubscription({ character_count: 9_999, character_limit: 10_000 }),
  });
  assertDeniedWithoutPost(scenario, "insufficient_included_quota");
});

test("ElevenLabs quota guard rejects enabled extension or overage capacity with zero POST", async () => {
  const scenario = await runMockQuotaScenario({
    subscription: mockSubscription({
      character_count: 100,
      character_limit: 10_000,
      can_extend_character_limit: true,
      max_credit_limit_extension: "unlimited",
    }),
  });
  assertDeniedWithoutPost(scenario, "extension_or_overage_enabled");
  assert.equal(scenario.recordedFacts.extensionOrOverageAvailable, true);
});

test("ElevenLabs quota guard denies open invoices, pending payment, and current overage with zero POST", async (t) => {
  const cases = [
    {
      name: "open invoice",
      subscription: mockSubscription({ has_open_invoices: true, open_invoices: [{ payment_intent_status: "processing" }] }),
      reasonCode: "open_invoice_or_payment_pending",
    },
    {
      name: "pending payment status",
      subscription: mockSubscription({ status: "past_due" }),
      reasonCode: "subscription_not_active_or_payment_pending",
    },
    {
      name: "pending invoice payment intent",
      subscription: mockSubscription({ next_invoice: { payment_intent_status: "processing", amount_due_cents: 1_000 } }),
      reasonCode: "open_invoice_or_payment_pending",
    },
    {
      name: "existing overage",
      subscription: mockSubscription({ current_overage: { amount: "0.01", currency: "usd" } }),
      reasonCode: "current_overage_nonzero",
    },
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      assertDeniedWithoutPost(await runMockQuotaScenario({ subscription: item.subscription }), item.reasonCode);
    });
  }
});

test("ElevenLabs quota guard fails closed on malformed subscription responses with zero POST", async (t) => {
  const cases = [
    { name: "null payload", subscription: null },
    { name: "missing quota field", subscription: mockSubscription({ character_limit: undefined }) },
    { name: "missing extension-disable proof", subscription: mockSubscription({ can_extend_character_limit: undefined }) },
    { name: "malformed overage", subscription: mockSubscription({ current_overage: { amount: "unknown" } }) },
    { name: "invalid JSON", jsonFailure: true },
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      assertDeniedWithoutPost(await runMockQuotaScenario(item), "subscription_response_malformed");
    });
  }
});

test("ElevenLabs quota guard fails closed on GET failure with zero POST", async (t) => {
  await t.test("network failure", async () => {
    assertDeniedWithoutPost(await runMockQuotaScenario({ getFailure: true }), "subscription_get_failed");
  });
  await t.test("HTTP failure", async () => {
    assertDeniedWithoutPost(await runMockQuotaScenario({ getStatus: 503 }), "subscription_get_http_error");
  });
});

test("ElevenLabs quota guard fails closed on a subscription redirect with zero synthesis POST", async () => {
  const scenario = await runMockQuotaScenario({ getStatus: 302 });
  assertDeniedWithoutPost(scenario, "subscription_get_http_error");
  assert.deepEqual(scenario.calls, [{
    method: "GET",
    redirect: "error",
    url: "https://api.elevenlabs.io/v1/user/subscription",
  }]);
});

test("runtime narration reconciliation resumes after every local write without another provider call", async (t) => {
  const audio = Buffer.alloc(12_000, 0x49);
  const quotaFacts = {
    checkedAt: "2026-08-12T07:55:00.000Z",
    sanitized: true,
    result: "approved",
    reasonCode: "included_quota_sufficient",
    httpStatus: 200,
    exactNarrationCharacters: RUNTIME_NARRATION_CONTRACT.exactCharacters,
    safetyMultiplier: 1.1,
    requiredIncludedCharacters: RUNTIME_NARRATION_CONTRACT.requiredIncludedCharacters,
    remainingIncludedCharacters: 9_000,
    subscriptionActive: true,
    currentOverageIsZero: true,
    hasOpenInvoices: false,
    paymentPendingOrFailed: false,
    extensionOrOverageAvailable: false,
  };
  for (const interruptAfter of ["audio", "ledger", "manifest", "receipt"]) {
    await t.test(interruptAfter, async () => {
      const directory = mkdtempSync(join(tmpdir(), "finaltab-narration-reconcile-"));
      const paths = {
        audioPath: join(directory, "voice.mp3"),
        ledgerPath: join(directory, "ledger.json"),
        manifestPath: join(directory, "manifest.json"),
        receiptPath: join(directory, "receipt.json"),
      };
      writeFileSync(paths.ledgerPath, JSON.stringify({
        schemaVersion: 3,
        status: "pending-v3-single-batch",
        sanitized: true,
        containsCredentials: false,
        provider: "ElevenLabs",
        model: "eleven_multilingual_v2",
        voiceId: "JBFqnCBsd6RMkjVDRZzb",
        outputFormat: "mp3_44100_128",
        scriptWordCount: 188,
        callSummary: { expectedProviderCalls: 1, selectedProviderCalls: 0, supersededProviderCalls: 0, reusedSceneCalls: 0 },
        selectedBatch: null,
      }));
      writeFileSync(paths.manifestPath, JSON.stringify({
        schemaVersion: 3,
        status: "pending-v3-single-batch",
        provider: "ElevenLabs",
        model: "eleven_multilingual_v2",
        voiceId: "JBFqnCBsd6RMkjVDRZzb",
        outputFormat: "mp3_44100_128",
        expectedProviderCalls: 1,
        selectedProviderCalls: 0,
      }));
      try {
        await assert.rejects(
          reconcileRuntimeNarrationArtifacts({
            audio,
            quotaFacts,
            replayed: false,
            providerPostsThisRequest: 1,
            paths,
            interruptAfter,
          }),
          new RegExp(`TEST_INTERRUPT_AFTER_${interruptAfter.toUpperCase()}`),
        );
        await reconcileRuntimeNarrationArtifacts({
          audio,
          quotaFacts,
          replayed: true,
          providerPostsThisRequest: 0,
          paths,
        });
        const ledger = JSON.parse(readFileSync(paths.ledgerPath, "utf8"));
        const manifest = JSON.parse(readFileSync(paths.manifestPath, "utf8"));
        const receipt = JSON.parse(readFileSync(paths.receiptPath, "utf8"));
        assert.equal(ledger.status, "generated-v3-single-batch");
        assert.equal(ledger.callSummary.attemptedProviderCalls, 1);
        assert.equal(ledger.selectedBatch.providerPostsThisRequest, 0);
        assert.equal(ledger.quotaPreflight.checkedAt, quotaFacts.checkedAt);
        assert.equal(manifest.status, "generated-v3-single-batch");
        assert.equal(receipt.providerPostsThisRequest, 0);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

test("runtime audio verification accepts a missing Content-Length but binds any supplied length and SHA", () => {
  const audio = Buffer.alloc(RUNTIME_NARRATION_CONTRACT.minAudioBytes, 0x49);
  const audioSha256 = hash(audio);
  const withoutLength = { headers: new Headers({ "x-finaltab-narration-audio-sha256": audioSha256 }) };
  assert.equal(verifyRuntimeAudioResponse(withoutLength, audio), audioSha256);
  const exactLength = { headers: new Headers({
    "content-length": String(audio.length),
    "x-finaltab-narration-audio-sha256": audioSha256,
  }) };
  assert.equal(verifyRuntimeAudioResponse(exactLength, audio), audioSha256);
  const wrongLength = { headers: new Headers({
    "content-length": String(audio.length + 1),
    "x-finaltab-narration-audio-sha256": audioSha256,
  }) };
  assert.throws(() => verifyRuntimeAudioResponse(wrongLength, audio), /RUNTIME_AUDIO_INVALID/u);
});

test("runtime runner loads its dedicated capability only from the ignored file contract", async () => {
  const directory = mkdtempSync(join(tmpdir(), "finaltab-narration-capability-"));
  const credentialPath = join(directory, "finaltab-v3-narration-operator-token.local.json");
  const capability = "ftv3_test_dedicated_capability_000000000001";
  try {
    writeFileSync(credentialPath, JSON.stringify({ version: 1, capability }));
    assert.equal(await loadRuntimeNarrationCapability(credentialPath), capability);
    writeFileSync(credentialPath, JSON.stringify({ version: 1, token: capability }));
    await assert.rejects(loadRuntimeNarrationCapability(credentialPath), /OPERATOR_CAPABILITY_FILE_INVALID/u);
    const runnerSource = read("scripts/run-runtime-narration.mjs").toString("utf8");
    assert.match(runnerSource, /finaltab-v3-narration-operator-token\.local\.json/u);
    assert.match(runnerSource, /"x-finaltab-v3-narration-token": operatorCapability/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
