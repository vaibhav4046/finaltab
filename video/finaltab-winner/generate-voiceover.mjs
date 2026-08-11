import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const proofDir = resolve(projectDir, "../../proof-output/finaltab-winner/voiceover");
const assetDir = join(projectDir, "assets", "audio", "voice");
const manifestPath = join(projectDir, "data", "voiceover-manifest.json");
const requiredChangedScenes = [3, 4, 5, 6, 8];
const unchangedScenes = [1, 2, 7, 9];
const sceneStarts = [0.65, 6.2, 16.4, 31.4, 44.2, 56.35, 66.25, 73.15, 91.05];
const sceneEnds = [6, 16, 31, 44, 56, 66, 73, 91, 96];

function invariant(value, message) {
  if (!value) throw new Error(message);
}

const scenesOption = process.argv.find((value) => value.startsWith("--scenes="));
invariant(scenesOption, "Selective generation is mandatory. Use --scenes=3,4,5,6,8 after canonical captures are locked.");
const requestedScenes = [...new Set(scenesOption.slice("--scenes=".length).split(",").map((value) => Number(value.trim())))];
invariant(requestedScenes.length > 0 && requestedScenes.every(Number.isInteger), "--scenes must contain scene numbers");
invariant(requestedScenes.every((scene) => requiredChangedScenes.includes(scene)), "Only changed scenes 3, 4, 5, 6, and 8 may be regenerated");
const capturesLocked = process.argv.includes("--approved-captures-locked");
if (capturesLocked) {
  invariant(
    requestedScenes.length === requiredChangedScenes.length
      && requiredChangedScenes.every((scene) => requestedScenes.includes(scene)),
    "--approved-captures-locked requires regenerating the complete changed-scene set in one run",
  );
}

const voiceId = process.env.ELEVENLABS_VIDEO_VOICE_ID?.trim() || "JBFqnCBsd6RMkjVDRZzb";
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
invariant(apiKey, "ELEVENLABS_API_KEY is required in the process environment");

const script = await readFile(join(projectDir, "SCRIPT.md"), "utf8");
const lines = [...script.matchAll(/^ {4}(.+)$/gm)].map((match) => match[1].trim());
invariant(lines.length === 9 && lines.every(Boolean), `Expected exactly 9 indented narration lines in SCRIPT.md; found ${lines.length}`);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
invariant(Array.isArray(manifest.scenes) && manifest.scenes.length === 9, "Existing voiceover manifest must contain exactly nine scenes");
for (const scene of unchangedScenes) {
  invariant(
    manifest.scenes[scene - 1]?.text === lines[scene - 1],
    `Scene ${scene} wording changed unexpectedly; selective regeneration is restricted to scenes 3, 4, 5, 6, and 8`,
  );
}

await mkdir(proofDir, { recursive: true });
await mkdir(assetDir, { recursive: true });

for (const sceneNumber of requestedScenes) {
  const index = sceneNumber - 1;
  const scene = String(sceneNumber).padStart(2, "0");
  const text = lines[index];
  const endpoint = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`);
  endpoint.searchParams.set("output_format", "mp3_44100_128");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      seed: 4046 + index,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.12,
        use_speaker_boost: true,
        speed: 1.08,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs scene ${scene} failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  invariant(typeof payload.audio_base64 === "string" && payload.alignment, `ElevenLabs scene ${scene} returned no audio or timing alignment`);
  const audio = Buffer.from(payload.audio_base64, "base64");
  const alignment = payload.normalized_alignment ?? payload.alignment;
  const endTimes = alignment.character_end_times_seconds;
  const durationSeconds = Array.isArray(endTimes) && endTimes.length > 0
    ? Number(endTimes[endTimes.length - 1])
    : null;
  invariant(Number.isFinite(durationSeconds), `ElevenLabs scene ${scene} returned no usable duration`);
  invariant(
    sceneStarts[index] + durationSeconds <= sceneEnds[index] + 0.015,
    `Scene ${scene} audio ends at ${(sceneStarts[index] + durationSeconds).toFixed(3)}s, outside its ${sceneEnds[index]}s frame`,
  );

  const audioName = `scene-${scene}.mp3`;
  const alignmentName = `scene-${scene}-alignment.json`;
  const alignmentRecord = `${JSON.stringify({ text, alignment, originalAlignment: payload.alignment }, null, 2)}\n`;
  for (const directory of [assetDir, proofDir]) {
    await writeFile(join(directory, audioName), audio, { flag: "w" });
    await writeFile(join(directory, alignmentName), alignmentRecord, "utf8");
  }

  manifest.scenes[index] = {
    scene: sceneNumber,
    text,
    audio: audioName,
    alignment: alignmentName,
    durationSeconds,
    bytes: audio.length,
    sha256: createHash("sha256").update(audio).digest("hex"),
  };
  process.stdout.write(`Generated changed scene ${scene} (${durationSeconds.toFixed(2)}s)\n`);
}

for (const sceneNumber of unchangedScenes) {
  const item = manifest.scenes[sceneNumber - 1];
  const alignment = await readFile(join(proofDir, item.alignment));
  await writeFile(join(assetDir, item.alignment), alignment, { flag: "w" });
}

const previouslyPending = Array.isArray(manifest.changedScenesPendingRegeneration)
  ? manifest.changedScenesPendingRegeneration
  : requiredChangedScenes;
const pending = previouslyPending.filter((scene) => !requestedScenes.includes(scene));
manifest.generatedAt = new Date().toISOString();
manifest.status = pending.length === 0 ? "generated-awaiting-caption-sync" : "pending-selective-regeneration";
manifest.regenerateAfterApprovedCaptures = pending.length > 0;
manifest.changedScenesPendingRegeneration = pending;
manifest.unchangedScenesRetained = unchangedScenes;
manifest.captionSyncRequired = true;
manifest.captureLockAcknowledged = capturesLocked;
manifest.scriptSha256 = createHash("sha256").update(script).digest("hex");
manifest.provider = "ElevenLabs";
manifest.model = "eleven_multilingual_v2";
manifest.voiceId = voiceId;
manifest.outputFormat = "mp3_44100_128";
manifest.voiceSettings = {
  stability: 0.45,
  similarityBoost: 0.75,
  style: 0.12,
  speakerBoost: true,
  speed: 1.08,
};
manifest.source = "video/finaltab-winner/SCRIPT.md";
delete manifest.scriptUpdateRequired;

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(manifestPath, serialized, "utf8");
await writeFile(join(proofDir, "manifest.json"), serialized, "utf8");
process.stdout.write(`Voice package updated: ${requestedScenes.length} changed scenes; ${pending.length} remain. Run npm run captions after the full changed set succeeds.\n`);
