import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveMediaTools } from "./resolve-media-tools.mjs";
import { scriptNarrationLines, words } from "./v3-tooling.mjs";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pathFor = (relativePath) => join(projectDir, ...relativePath.split("/"));
const readJson = (relativePath) => JSON.parse(readFileSync(pathFor(relativePath), "utf8"));
const writeJson = (relativePath, payload) => writeFileSync(pathFor(relativePath), `${JSON.stringify(payload, null, 2)}\n`);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
const { ffmpeg, ffprobe } = resolveMediaTools();

function run(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectDir,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed${result.error ? `: ${result.error.message}` : `: ${(result.stderr || result.stdout || "").trim()}`}`);
  }
  return result;
}

function probeDuration(file) {
  const result = run(ffprobe.path, ["-v", "error", "-show_entries", "format=duration", "-of", "json", file], `Probe ${file}`);
  return Number(JSON.parse(result.stdout).format.duration);
}

function scriptWindows(source) {
  const seconds = (value) => {
    const [minutes, rest] = value.split(":");
    return Number(minutes) * 60 + Number(rest);
  };
  return [...source.matchAll(/\*\*Time:\*\* (\d\d:\d\d\.\d\d\d) . (\d\d:\d\d\.\d\d\d)/gu)]
    .map((match) => [seconds(match[1]), seconds(match[2])]);
}

function loudness(file) {
  const sink = process.platform === "win32" ? "NUL" : "/dev/null";
  const result = spawnSync(ffmpeg.path, [
    "-hide_banner", "-nostats", "-i", file,
    "-af", "loudnorm=I=-14:LRA=7:TP=-1:print_format=json",
    "-f", "null", sink,
  ], { cwd: projectDir, encoding: "utf8", windowsHide: true });
  invariant(!result.error, `Loudness analysis could not start: ${result.error?.message ?? "unknown error"}`);
  const matches = [...String(result.stderr).matchAll(/\{\s*"input_i"[\s\S]*?\}/gu)];
  invariant(matches.length > 0, "Loudness analysis did not return JSON");
  return JSON.parse(matches.at(-1)[0]);
}

function resolveCachedHyperframesCli() {
  const override = process.env.HYPERFRAMES_CLI;
  if (override && existsSync(override)) return override;
  const npxRoot = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  invariant(existsSync(npxRoot), "HyperFrames 0.7.106 is not cached; run the approved local-model setup before narration generation");
  for (const entry of readdirSync(npxRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(npxRoot, entry.name, "node_modules", "hyperframes", "package.json");
    if (!existsSync(packagePath)) continue;
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    if (packageJson.version === "0.7.106") {
      const cliPath = join(dirname(packagePath), "bin", "hyperframes.mjs");
      if (existsSync(cliPath)) return cliPath;
    }
  }
  throw new Error("HyperFrames 0.7.106 CLI is not cached; provide HYPERFRAMES_CLI for the approved pinned local runtime");
}

const contract = readJson("data/v3-source-contract.json");
const scriptSource = readFileSync(pathFor("SCRIPT.md"), "utf8");
const lines = scriptNarrationLines(scriptSource);
const windows = scriptWindows(scriptSource);
const allWords = words(lines.join(" "));
invariant(contract.schemaVersion === 3 && contract.durationSeconds === 90, "V3 contract must remain exactly 90 seconds");
invariant(lines.length === 8 && windows.length === 8, "The local narration requires all eight locked scenes");
invariant(allWords.length === 183 && contract.wordCount === 183, "The local narration must retain the exact 183-word script");
invariant(lines.every((line, index) => line === contract.scenes[index]?.narration), "SCRIPT.md differs from the frozen narration contract");

const sourceRelative = "assets/audio/voice-v3/source-local";
const sourceDir = pathFor(sourceRelative);
const masterRelative = "assets/audio/voice-v3/finaltab-v3-local-kokoro-master.mp3";
const alignmentRelative = "assets/audio/voice-v3/finaltab-v3-local-kokoro-alignment.json";
const masterPath = pathFor(masterRelative);
const requestPath = pathFor("data/local-narration-request.json");
const premasterPath = pathFor("assets/audio/voice-v3/.finaltab-v3-local-premaster.wav");
const sourceLockRelative = "data/local-narration-source-lock.json";
mkdirSync(sourceDir, { recursive: true });
const sceneSpeeds = lines.map((_, index) => index === 7 ? 1.25 : 1.05);

const request = {
  schemaVersion: 1,
  provider: "Kokoro-82M (local)",
  model: "kokoro-v1.0",
  voiceName: "George (British male)",
  voiceId: "bm_george",
  language: "en-gb",
  ttsProviderCallsAllowed: 0,
  scenes: lines.map((text, index) => ({ scene: index + 1, text, speed: sceneSpeeds[index] })),
};
writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);

const hyperframesCli = resolveCachedHyperframesCli();
const pythonPath = pathFor(".venv-kokoro/Scripts/python.exe");
const modelPath = join(homedir(), ".cache", "hyperframes", "tts", "models", "kokoro-v1.0.onnx");
const voicesPath = join(homedir(), ".cache", "hyperframes", "tts", "voices", "voices-v1.0.bin");
invariant(existsSync(pythonPath), "The project-local Kokoro Python runtime is missing");
invariant(existsSync(modelPath) && statSync(modelPath).size > 300_000_000, "The approved local Kokoro model cache is missing or incomplete");
invariant(existsSync(voicesPath) && statSync(voicesPath).size > 20_000_000, "The approved local Kokoro voice cache is missing or incomplete");
const sourceFiles = lines.map((_, index) => join(sourceDir, `scene-${String(index + 1).padStart(2, "0")}-kokoro.wav`));
let sourceLock = existsSync(pathFor(sourceLockRelative))
  ? readJson(sourceLockRelative)
  : { schemaVersion: 1, status: "local-kokoro-sources-in-progress", provider: "Kokoro-82M (local)", model: "kokoro-v1.0", voiceId: "bm_george", assets: [] };
invariant(sourceLock.schemaVersion === 1 && Array.isArray(sourceLock.assets), "Local narration source lock is invalid");
for (const [index, text] of lines.entries()) {
  const expected = {
    scene: index + 1,
    textSha256: hash(text),
    speed: sceneSpeeds[index],
    path: `${sourceRelative}/scene-${String(index + 1).padStart(2, "0")}-kokoro.wav`,
  };
  const existing = sourceLock.assets.find((item) => item.scene === index + 1);
  const reusable = existing
    && existing.textSha256 === expected.textSha256
    && existing.speed === expected.speed
    && existing.path === expected.path
    && existsSync(sourceFiles[index])
    && statSync(sourceFiles[index]).size === existing.bytes
    && hash(readFileSync(sourceFiles[index])) === existing.sha256;
  if (reusable) continue;
  run(process.execPath, [
    hyperframesCli, "tts", text,
    "--voice", "bm_george", "--lang", "en-gb", "--speed", String(sceneSpeeds[index]), "--output", sourceFiles[index],
  ], `Local Kokoro scene ${index + 1}`, {
    env: {
      ...process.env,
      HYPERFRAMES_PYTHON: pythonPath,
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
    },
  });
  const sourceBytes = readFileSync(sourceFiles[index]);
  sourceLock.assets = sourceLock.assets.filter((item) => item.scene !== index + 1);
  sourceLock.assets.push({ ...expected, bytes: sourceBytes.length, sha256: hash(sourceBytes) });
  sourceLock.assets.sort((left, right) => left.scene - right.scene);
  sourceLock.updatedAt = new Date().toISOString();
  writeJson(sourceLockRelative, sourceLock);
}
invariant(sourceFiles.every((file) => existsSync(file) && statSync(file).size > 10_000), "Kokoro did not produce all eight audible scene sources");
const sourceDurations = sourceFiles.map(probeDuration);
const trimLead = 0.035;
const trimTail = 0.06;
const timings = sourceDurations.map((duration, index) => {
  const speechDuration = Math.max(0.1, duration - trimLead - trimTail);
  const available = windows[index][1] - windows[index][0];
  const atempoFactor = Math.max(1, speechDuration / available);
  invariant(atempoFactor <= 1.24, `Scene ${index + 1} needs ${atempoFactor.toFixed(3)}x tempo; revise the offline delivery instead of over-compressing it`);
  return { speechDuration, available, atempoFactor, finalDuration: speechDuration / atempoFactor };
});

const filterParts = [];
const mixInputs = [];
for (const [index, timing] of timings.entries()) {
  const delayMilliseconds = Math.round(windows[index][0] * 1000);
  filterParts.push(
    `[${index}:a]atrim=start=${trimLead.toFixed(3)}:end=${(sourceDurations[index] - trimTail).toFixed(3)},` +
    `asetpts=PTS-STARTPTS,atempo=${timing.atempoFactor.toFixed(6)},adelay=${delayMilliseconds}:all=1[s${index}]`,
  );
  mixInputs.push(`[s${index}]`);
}
filterParts.push(`anullsrc=r=44100:cl=mono:d=90.05[silence]`);
filterParts.push(`${mixInputs.join("")}[silence]amix=inputs=9:normalize=0:duration=longest,apad=whole_dur=90,atrim=start=0:end=90[premaster]`);
run(ffmpeg.path, [
  "-hide_banner", "-loglevel", "error", "-y",
  ...sourceFiles.flatMap((file) => ["-i", file]),
  "-filter_complex", filterParts.join(";"), "-map", "[premaster]", "-ar", "44100", "-ac", "1", premasterPath,
], "Offline scene timing mix");

const masteringFilter = "loudnorm=I=-14:LRA=7:TP=-2:linear=false:print_format=summary,volume=1.0dB";
run(ffmpeg.path, [
  "-hide_banner", "-loglevel", "error", "-y", "-i", premasterPath,
  "-af", `${masteringFilter},apad=whole_dur=90,atrim=start=0:end=90`, "-ar", "44100", "-ac", "1", "-b:a", "128k", masterPath,
], "Offline narration mastering");
try {
  rmSync(premasterPath, { force: true });
} catch (error) {
  if (error?.code !== "EPERM") throw error;
}

const duration = probeDuration(masterPath);
invariant(Math.abs(duration - 90) <= 0.08, `Local narration master is ${duration.toFixed(3)}s, not 90.000s`);
const masteredLoudness = loudness(masterPath);
const integratedLufs = Number(masteredLoudness.input_i);
const truePeakDbtp = Number(masteredLoudness.input_tp);
invariant(Number.isFinite(integratedLufs) && Math.abs(integratedLufs - (-14)) <= 0.4, `Local narration is ${integratedLufs} LUFS, outside the audible target`);
invariant(Number.isFinite(truePeakDbtp) && truePeakDbtp <= -1, `Local narration true peak is ${truePeakDbtp} dBTP`);

let wordCursor = 0;
const alignedScenes = contract.scenes.map((scene, index) => {
  const sceneWords = words(lines[index]);
  const speechStart = windows[index][0];
  const speechEnd = speechStart + timings[index].finalDuration;
  const weights = sceneWords.map((word) => Math.max(2, word.length + 0.8));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let weightCursor = 0;
  const aligned = sceneWords.map((text, sceneWordIndex) => {
    const start = speechStart + (weightCursor / totalWeight) * (speechEnd - speechStart);
    weightCursor += weights[sceneWordIndex];
    const end = speechStart + (weightCursor / totalWeight) * (speechEnd - speechStart);
    const item = { id: `w${wordCursor}`, text, start: Number(start.toFixed(6)), end: Number(end.toFixed(6)) };
    wordCursor += 1;
    return item;
  });
  return {
    scene: scene.scene,
    start: aligned[0].start,
    end: aligned.at(-1).end,
    text: scene.narration,
    atempoFactor: Number(timings[index].atempoFactor.toFixed(6)),
    words: aligned,
  };
});
invariant(wordCursor === 183, "Local alignment did not cover all 183 words");

const generatedAt = new Date().toISOString();
const masterBytes = readFileSync(masterPath);
const sourceAssets = sourceFiles.map((file, index) => {
  const bytes = readFileSync(file);
  return {
    scene: index + 1,
    path: `${sourceRelative}/scene-${String(index + 1).padStart(2, "0")}-kokoro.wav`,
    bytes: bytes.length,
    sha256: hash(bytes),
    durationSeconds: sourceDurations[index],
  };
});
writeJson(alignmentRelative, {
  schemaVersion: 3,
  status: "approved-v3-alignment",
  source: "exact-script-local-kokoro",
  scriptWordCount: 183,
  durationSeconds: 90,
  createdAt: generatedAt,
  timingMapping: {
    method: "local-kokoro-known-source-proportional-v1",
    lockedWordCount: 183,
    mappedWordCount: 183,
    fullMonotonicMapping: true,
    transcriptSource: "exact text supplied directly to the local synthesizer",
  },
  scenes: alignedScenes,
});

const manifest = readJson("data/voiceover-manifest.json");
Object.assign(manifest, {
  status: "approved-v3-local-offline",
  provider: "Kokoro-82M (local)",
  model: "kokoro-v1.0",
  voiceName: "George (British male)",
  voiceId: "bm_george",
  outputFormat: "mp3_44100_128",
  batchScope: "complete-eight-scene-script-local",
  expectedProviderCalls: 0,
  selectedProviderCalls: 0,
  reuseAllowed: false,
  reusedAssets: [],
  wordCount: 183,
  scenes: contract.scenes.map((scene) => ({ scene: scene.scene, start: scene.start, end: scene.end, text: scene.narration })),
  scriptNarrationSha256: hash(lines.join("\n")),
  master: {
    path: masterRelative,
    alignmentPath: alignmentRelative,
    bytes: masterBytes.length,
    sha256: hash(masterBytes),
    durationSeconds: duration,
    generatedAt,
    batchId: null,
  },
  sourceAssets,
  captionAssets: { status: "pending-v3-alignment", cueJsonSha256: null, srtSha256: null, vttSha256: null, bakedIndexSha256: null },
});
delete manifest.rawProviderResponse;
writeJson("data/voiceover-manifest.json", manifest);

const ledger = readJson("data/narration-generation-ledger.json");
Object.assign(ledger, {
  status: "approved-v3-local-offline",
  provider: "Kokoro-82M (local)",
  model: "kokoro-v1.0",
  voiceName: "George (British male)",
  voiceId: "bm_george",
  outputFormat: "mp3_44100_128",
  batchScope: "complete-eight-scene-script-local",
  scriptWordCount: 183,
  callSummary: {
    expectedProviderCalls: 0,
    attemptedProviderCalls: 0,
    selectedProviderCalls: 0,
    supersededProviderCalls: 0,
    reusedSceneCalls: 0,
  },
  selectedBatch: null,
  scriptNarrationSha256: hash(lines.join("\n")),
  localGeneration: {
    generatedAt,
    provider: "Kokoro-82M (local)",
    model: "kokoro-v1.0",
    voiceId: "bm_george",
    ttsProviderCalls: 0,
    sourceAssetCount: 8,
    masterPath: masterRelative,
    masterSha256: hash(masterBytes),
  },
  elevenLabsDecision: {
    result: "quota-preflight-denied",
    subscriptionGetsAlreadyConsumed: 1,
    synthesisPosts: 0,
    retryAllowed: false,
    detailsRedacted: true,
  },
  note: "The authorized no-charge ElevenLabs preflight denied generation. No synthesis POST occurred and no retry was made. This approved narration was generated on-device with the locally cached Kokoro model.",
});
writeJson("data/narration-generation-ledger.json", ledger);

const audio = readJson("data/audio-manifest.json");
audio.status = "approved-v3-local-narration";
audio.bgmDecision = "No background music. Keep the local Kokoro narration clear and use restrained local SFX only.";
audio.narration = {
  status: "approved-v3-local-offline",
  provider: "Kokoro-82M (local)",
  model: "kokoro-v1.0",
  voiceName: "George (British male)",
  voiceId: "bm_george",
  path: masterRelative,
  bytes: masterBytes.length,
  sha256: hash(masterBytes),
  integratedLufs,
  truePeakDbtp,
};
writeJson("data/audio-manifest.json", audio);

const release = readJson("data/release-proof.json");
release.v3Film.singleBatchNarrationComplete = true;
release.v3Film.narrationFallback = {
  status: "approved-local-offline-after-no-charge-quota-denial",
  provider: "Kokoro-82M (local)",
  ttsProviderCalls: 0,
  elevenLabsSynthesisPosts: 0,
};
writeJson("data/release-proof.json", release);

process.stdout.write(
  `LOCAL NARRATION APPROVED · 8 scenes · 183 words · 90.000s · ${integratedLufs.toFixed(1)} LUFS · ${truePeakDbtp.toFixed(1)} dBTP · 0 TTS provider calls\n`,
);
