import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(projectDir, "../../proof-output/finaltab-winner/voiceover");
const voiceId = process.env.ELEVENLABS_VIDEO_VOICE_ID?.trim() || "JBFqnCBsd6RMkjVDRZzb";
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

if (!apiKey) {
  throw new Error("ELEVENLABS_API_KEY is required in the process environment");
}

const script = await readFile(join(projectDir, "SCRIPT.md"), "utf8");
const lines = [...script.matchAll(/^ {4}(.+)$/gm)].map((match) => match[1].trim());
if (lines.length !== 9 || lines.some((line) => line.length === 0)) {
  throw new Error(`Expected exactly 9 indented narration lines in SCRIPT.md; found ${lines.length}`);
}

await mkdir(outputDir, { recursive: true });
const manifest = {
  generatedAt: new Date().toISOString(),
  provider: "ElevenLabs",
  model: "eleven_multilingual_v2",
  voiceId,
  outputFormat: "mp3_44100_128",
  voiceSettings: { stability: 0.45, similarityBoost: 0.75, style: 0.12, speakerBoost: true, speed: 1.08 },
  source: "video/finaltab-winner/SCRIPT.md",
  scenes: [],
};

for (const [index, text] of lines.entries()) {
  const scene = String(index + 1).padStart(2, "0");
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
  if (typeof payload.audio_base64 !== "string" || !payload.alignment) {
    throw new Error(`ElevenLabs scene ${scene} returned no audio or timing alignment`);
  }

  const audio = Buffer.from(payload.audio_base64, "base64");
  const alignment = payload.normalized_alignment ?? payload.alignment;
  const endTimes = alignment.character_end_times_seconds;
  const durationSeconds = Array.isArray(endTimes) && endTimes.length > 0
    ? Number(endTimes[endTimes.length - 1])
    : null;
  const audioName = `scene-${scene}.mp3`;
  const alignmentName = `scene-${scene}-alignment.json`;

  await writeFile(join(outputDir, audioName), audio, { flag: "w" });
  await writeFile(
    join(outputDir, alignmentName),
    `${JSON.stringify({ text, alignment, originalAlignment: payload.alignment }, null, 2)}\n`,
    "utf8",
  );

  manifest.scenes.push({
    scene: index + 1,
    text,
    audio: audioName,
    alignment: alignmentName,
    durationSeconds,
    bytes: audio.length,
    sha256: createHash("sha256").update(audio).digest("hex"),
  });
  process.stdout.write(`Generated scene ${scene} (${durationSeconds?.toFixed(2) ?? "unknown"}s)\n`);
}

await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Voiceover complete: ${manifest.scenes.length} scenes\n`);
