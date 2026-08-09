// Generates demo voiceover mp3s via ElevenLabs. Key lives in gitignored
// apps/web/.env.local (ELEVENLABS_API_KEY); output goes to gitignored proof-output/.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(resolve(root, "apps/web/.env.local"), "utf8");
const key = env.match(/ELEVENLABS_API_KEY=(\S+)/)?.[1];
if (!key) {
  console.error("ELEVENLABS_API_KEY missing from apps/web/.env.local");
  process.exitCode = 1;
} else {
  const VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George: calm narration
  const MODEL = "eleven_multilingual_v2";
  const scenes = [
    ["scene1-cold-open", "Every split app dies at the same spot: the part where money actually moves. FINALTab doesn't."],
    ["scene2-extraction", "Groq vision reads the receipt into strict JSON. Every amount is an integer minor unit. There is not a single float touching money in this codebase."],
    ["scene3-allocation", "The model proposes. The engine decides. Largest-remainder splitting, cent-perfect, re-reconciled against the receipt every time. In testing, the model hallucinated about the service charge; the engine split it correctly anyway."],
    ["scene4-netting", "The debt graph nets down to the minimum transfers before anyone signs."],
    ["scene5-freeze-sign", "The ledger freezes into a keccak-256 hash. Signature nonces derive from that hash, so editing anything after signing kills every signature by construction. Debtors sign gasless USDC authorizations. No approvals."],
    ["scene6-simulate", "KeeperHub is the only execution layer. Simulate first. A failed simulation is never broadcast."],
    ["scene7-verified", "A transaction hash proves submission. Only a chain-verified receipt proves landing. FINALTab never says settled until the chain does."],
    ["scene8-cli-close", "We shipped the same discipline upstream. kh execute status can now refuse to call it done until receipts are chain-verified. One flag gates any agent pipeline on proof instead of hope. That is FINALTab."],
  ];
  const outDir = resolve(root, "proof-output/voiceover");
  mkdirSync(outDir, { recursive: true });
  let failed = 0;
  for (const [name, text] of scenes) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!res.ok) {
      failed += 1;
      console.error(`${name} FAILED ${res.status} ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(resolve(outDir, `${name}.mp3`), buf);
    console.log(`${name}.mp3 ${(buf.length / 1024).toFixed(0)} KB`);
  }
  process.exitCode = failed === 0 ? 0 : 1;
}
