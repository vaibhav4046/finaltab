import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (path) => JSON.parse(readFileSync(join(projectDir, path), "utf8"));
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
const lines = [...readFileSync(join(projectDir, "SCRIPT.md"), "utf8").matchAll(/^ {4}(.+)$/gmu)].map((match) => match[1].trim());
const manifest = readJson("data/voiceover-manifest.json");
const ledger = readJson("data/narration-generation-ledger.json");

invariant(lines.length === 8, "V3 script must contain eight narration lines");
invariant(manifest.schemaVersion === 3 && ledger.schemaVersion === 3, "V3 voice schemas differ");
invariant(manifest.provider === "Kokoro-82M (local)" && ledger.provider === manifest.provider, "Local voice provider differs");
invariant(manifest.model === "kokoro-v1.0" && ledger.model === manifest.model, "Local voice model differs");
invariant(manifest.voiceId === "bm_george" && ledger.voiceId === manifest.voiceId, "Local voice ID differs");
invariant(manifest.expectedProviderCalls === 0 && ledger.callSummary.expectedProviderCalls === 0, "Offline V3 narration must make zero provider calls");
invariant(manifest.reuseAllowed === false && manifest.reusedAssets.length === 0 && ledger.callSummary.reusedSceneCalls === 0, "Old narration reuse is forbidden");
invariant(manifest.scenes.length === 8 && manifest.scenes.every((scene, index) => scene.text === lines[index]), "Voice manifest text differs from SCRIPT.md");
invariant(manifest.status === "approved-v3-local-offline" && ledger.status === manifest.status, "Approved offline V3 voice states differ");
invariant(manifest.selectedProviderCalls === 0 && ledger.callSummary.selectedProviderCalls === 0, "Offline V3 narration selected a provider call");
invariant(ledger.callSummary.attemptedProviderCalls === 0 && ledger.localGeneration?.ttsProviderCalls === 0, "Local V3 narration attempted a TTS provider request");
invariant(ledger.elevenLabsDecision?.synthesisPosts === 0 && ledger.elevenLabsDecision?.retryAllowed === false, "ElevenLabs no-retry boundary differs");
process.stdout.write("VOICE PACKAGE CONTRACT PASSED · eight-scene local Kokoro master · zero TTS provider calls · zero ElevenLabs synthesis POSTs\n");
