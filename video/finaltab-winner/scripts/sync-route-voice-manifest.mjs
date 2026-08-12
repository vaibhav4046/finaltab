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
invariant(manifest.provider === "ElevenLabs" && ledger.provider === "ElevenLabs", "Voice provider differs");
invariant(manifest.model === "eleven_multilingual_v2" && ledger.model === "eleven_multilingual_v2", "Voice model differs");
invariant(manifest.voiceId === "JBFqnCBsd6RMkjVDRZzb" && ledger.voiceId === manifest.voiceId, "George voice ID differs");
invariant(manifest.expectedProviderCalls === 1 && ledger.callSummary.expectedProviderCalls === 1, "V3 requires one complete-script provider batch");
invariant(manifest.reuseAllowed === false && manifest.reusedAssets.length === 0 && ledger.callSummary.reusedSceneCalls === 0, "Old narration reuse is forbidden");
invariant(manifest.scenes.length === 8 && manifest.scenes.every((scene, index) => scene.text === lines[index]), "Voice manifest text differs from SCRIPT.md");

if (manifest.status === "pending-v3-single-batch") {
  invariant(manifest.selectedProviderCalls === 0 && ledger.status === "pending-v3-single-batch", "Pending V3 voice state is inconsistent");
  process.stdout.write("VOICE SOURCE CONTRACT PASSED · one new George multilingual-v2 complete-script batch is still pending\n");
} else {
  invariant(manifest.status === "approved-v3-single-batch" && ledger.status === "approved-v3-single-batch", "Approved V3 voice states differ");
  invariant(manifest.selectedProviderCalls === 1 && ledger.callSummary.selectedProviderCalls === 1, "Approved V3 package must bind one selected provider call");
  process.stdout.write("VOICE PACKAGE CONTRACT PASSED · one new George multilingual-v2 batch is recorded\n");
}
