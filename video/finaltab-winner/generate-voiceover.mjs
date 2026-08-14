import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  invariant,
  parseArgs,
  readJson,
  scriptNarrationLines,
  words,
  writeJsonAtomic,
} from "./scripts/v3-tooling.mjs";
import { getElevenLabsQuotaPreflight } from "./scripts/elevenlabs-quota-guard.mjs";

const projectDir = dirname(fileURLToPath(import.meta.url));
const pathFor = (relativePath) => join(projectDir, ...relativePath.split("/"));
const args = parseArgs(process.argv.slice(2));
const contract = readJson(pathFor("data/v3-source-contract.json"));
const manifestPath = pathFor("data/voiceover-manifest.json");
const ledgerPath = pathFor("data/narration-generation-ledger.json");
const manifest = readJson(manifestPath);
const ledger = readJson(ledgerPath);
const script = readFileSync(pathFor("SCRIPT.md"), "utf8");
const lines = scriptNarrationLines(script);
const narration = lines.join("\n");
const normalizedNarration = lines.join("\n\n");
const rawPath = pathFor("assets/audio/voice-v3/finaltab-v3-george-provider-response.mp3");

function validateContract() {
  invariant(contract.schemaVersion === 3 && contract.durationSeconds === 90, "V3 source contract is not locked at 90 seconds");
  invariant(lines.length === 8, "SCRIPT.md must contain exactly eight narration lines");
  invariant(lines.every((line, index) => line === contract.scenes[index]?.narration), "SCRIPT.md narration differs from the frozen V3 source contract");
  invariant(words(narration).length === 188 && contract.wordCount === 188, "The selected narration must contain exactly 188 spoken words");
  invariant(contract.narration.providerCallsRequired === 1, "The frozen contract must require exactly one provider call");
  invariant(manifest.provider === "ElevenLabs" && ledger.provider === "ElevenLabs", "Narration provider must remain ElevenLabs");
  invariant(ledger.sanitized === true && ledger.containsCredentials === false, "Narration ledger must remain sanitized and credential-free");
  invariant(manifest.voiceId === contract.narration.voiceId && ledger.voiceId === manifest.voiceId, "Narration voice differs from the frozen contract");
  invariant(manifest.model === contract.narration.model && ledger.model === manifest.model, "Narration model differs from the frozen contract");
  invariant(manifest.expectedProviderCalls === 1 && ledger.callSummary.expectedProviderCalls === 1, "Narration manifests must allow one complete-script provider call");
  invariant(manifest.reuseAllowed === false && manifest.reusedAssets.length === 0, "Narration asset reuse must remain disabled");
}

function usage() {
  process.stdout.write([
    "ElevenLabs V3 contract checker and GET-only preflight",
    "",
    "  node generate-voiceover.mjs --check-contract",
    "  node generate-voiceover.mjs --preflight-only --acknowledge-one-no-charge-subscription-get",
    "  node generate-voiceover.mjs --execute --acknowledge-one-paid-provider-call  # retired; fails closed",
    "",
    "Preflight-only makes exactly one subscription GET, records sanitized aggregate facts, and cannot make a synthesis POST.",
    "Direct execution is retired; generation is available only through the bearer-token runtime operator with its durable one-shot journal.",
    "Neither path retries, extends quota, enters overage, upgrades, or buys credits.",
  ].join("\n") + "\n");
}

function validatePendingGenerationState() {
  invariant(manifest.status === "pending-v3-single-batch", `Refusing a provider call from manifest state ${manifest.status}`);
  invariant(ledger.status === "pending-v3-single-batch", `Refusing a provider call from ledger state ${ledger.status}`);
  invariant(manifest.selectedProviderCalls === 0 && ledger.callSummary.selectedProviderCalls === 0, "A provider batch is already selected");
  invariant(!statSync(pathFor("assets/audio"), { throwIfNoEntry: false })?.isFile(), "assets/audio must be a directory");
  invariant(!statSync(rawPath, { throwIfNoEntry: false }), `Raw provider response already exists: ${relative(projectDir, rawPath)}`);
}

function requireElevenLabsApiKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  invariant(
    apiKey,
    "ELEVENLABS_API_KEY is required in this process; Vercel Sensitive variables are not downloadable through `vercel env run`. Use the protected Vercel runtime operator for generation. No provider request was made.",
  );
  return apiKey;
}

validateContract();

if (args.help) {
  usage();
  process.exit(0);
}

invariant(!(args.execute && args["preflight-only"]), "Choose either --preflight-only or --execute, not both");

if (args["preflight-only"]) {
  invariant(args["acknowledge-one-no-charge-subscription-get"], "Preflight requires --acknowledge-one-no-charge-subscription-get");
  const apiKey = requireElevenLabsApiKey();
  validatePendingGenerationState();
  const checkedAt = new Date().toISOString();
  const preflight = await getElevenLabsQuotaPreflight({
    apiKey,
    narration: normalizedNarration,
    signal: AbortSignal.timeout(30_000),
  });
  ledger.quotaPreflight = { checkedAt, ...preflight.facts };
  writeJsonAtomic(ledgerPath, ledger);
  invariant(
    preflight.allowed,
    `ElevenLabs quota preflight denied (${preflight.facts.reasonCode}); no synthesis request was made`,
  );
  process.stdout.write(
    `QUOTA PREFLIGHT PASSED · ${preflight.facts.exactNarrationCharacters} exact characters · ${preflight.facts.requiredIncludedCharacters} conservatively required · ${preflight.facts.remainingIncludedCharacters} included remaining · no synthesis request made\n`,
  );
  process.exit(0);
}

if (!args.execute) {
  process.stdout.write(`VOICE GENERATOR CONTRACT PASSED · 1 request · 8 lines · ${words(narration).length} words · no provider request made\n`);
  process.exit(0);
}

invariant(args["acknowledge-one-paid-provider-call"], "Execution requires --acknowledge-one-paid-provider-call");
throw new Error(
  "Direct local synthesis is retired. Use the temporary bearer-token runtime operator and its durable single-use journal; this path cannot bypass or duplicate that operation.",
);
