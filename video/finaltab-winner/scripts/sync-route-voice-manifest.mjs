#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = resolve(projectDir, "../..");
const scriptPath = join(projectDir, "SCRIPT.md");
const manifestPath = join(projectDir, "data", "voiceover-manifest.json");
const captureLockPath = join(projectDir, "data", "capture-lock.json");
const voiceAssetDir = join(projectDir, "assets", "audio", "voice");
const proofVoiceDir = resolve(projectDir, "../../proof-output/finaltab-winner/voiceover");
const proofManifestPath = join(proofVoiceDir, "manifest.json");
const retainedProofManifestName = "retained-multilingual-v2-manifest.json";
const retainedProofManifestPath = join(proofVoiceDir, retainedProofManifestName);
const retainedProofManifestRepoPath = `proof-output/finaltab-winner/voiceover/${retainedProofManifestName}`;
const routeSourcePath = join(repoDir, "apps", "web", "lib", "server", "voice.ts");
const generationLedgerProjectPath = "data/narration-generation-ledger.json";
const generationLedgerPath = join(projectDir, "data", "narration-generation-ledger.json");
const changedScenes = [3, 4, 5, 6, 8];
const unchangedScenes = [1, 2, 7, 9];
const sceneStarts = [0.65, 6.2, 16.4, 31.4, 44.2, 56.35, 66.25, 73.15, 91.05];
const sceneEnds = [6, 16, 31, 44, 56, 66, 73, 91, 96];
const expectedCaptureIds = ["C03", "C04", "C05", "C06A", "C06B", "C07", "C08A", "C08B"];
const provider = "ElevenLabs";
const providerModel = "eleven_flash_v2_5";
const retainedProviderModel = "eleven_multilingual_v2";
const outputFormat = "mp3_44100_128";
const defaultVoiceId = "JBFqnCBsd6RMkjVDRZzb";
const generationEndpointPath = "/api/internal/video-narration";
const generationEndpointClass = "protected-expiring-fixed-scene-release";
const generationRouteLabel = `POST ${generationEndpointPath}`;
const generationLedgerRoute = `${generationRouteLabel} (protected, expiring release endpoint)`;
const generationDeployments = [
  {
    deploymentId: "dpl_Fuxjf39h4M8ocRird8SiSRK6nxeN",
    deploymentUrl: "https://finaltab-7b88w394j-vaibhav4046s-projects.vercel.app",
    role: "initial-candidate",
    canonicalProductAliasPromoted: false,
  },
  {
    deploymentId: "dpl_7gBR3AtNKDBwkduRbMknfgHdF45n",
    deploymentUrl: "https://finaltab-9zf0x4a3b-vaibhav4046s-projects.vercel.app",
    role: "duration-repair-candidate",
    canonicalProductAliasPromoted: false,
  },
  {
    deploymentId: "dpl_5aVre5mMDoB58DFQo7rbLqa3nztG",
    deploymentUrl: "https://finaltab-14c2uklv9-vaibhav4046s-projects.vercel.app",
    role: "final-scene-5-duration-repair-candidate",
    canonicalProductAliasPromoted: false,
  },
];
const generationDeploymentByScene = new Map([
  [3, generationDeployments[0]],
  [4, generationDeployments[0]],
  [5, generationDeployments[2]],
  [6, generationDeployments[1]],
  [8, generationDeployments[1]],
]);
const alignmentSource = "offline-faster-whisper-transcript-constrained";
const maxAlignmentCer = 0.2;
let temporaryFileCounter = 0;

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSource(value) {
  return value.replace(/\r\n?/gu, "\n");
}

function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readRequired(path, encoding, label) {
  try {
    return await readFile(path, encoding);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${path}`);
    throw error;
  }
}

async function readRetainedProofSource() {
  try {
    return await readFile(retainedProofManifestPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return readRequired(proofManifestPath, "utf8", "Pre-sync retained proof voice manifest");
  }
}

async function existingFileHash(path) {
  try {
    return sha256(await readFile(path));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function atomicReplace(path, value, expectedSha256, label, verifyApplied = true) {
  temporaryFileCounter += 1;
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${temporaryFileCounter}.tmp`,
  );
  try {
    await writeFile(temporaryPath, value, { flag: "wx" });
    invariant(sha256(await readFile(temporaryPath)) === expectedSha256, `${label} temporary hash differs`);
    await rename(temporaryPath, path);
    if (verifyApplied) {
      invariant(sha256(await readFile(path)) === expectedSha256, `${label} applied hash differs`);
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function requireProjectPath(path, label) {
  const pathRelativeToProject = relative(projectDir, path);
  invariant(
    pathRelativeToProject !== ""
      && !pathRelativeToProject.startsWith(`..${sep}`)
      && pathRelativeToProject !== ".."
      && !isAbsolute(pathRelativeToProject),
    `${label} resolves outside the video project`,
  );
}

function parseArguments(argv) {
  if (argv.includes("--help")) {
    process.stdout.write([
      "Usage: node scripts/sync-route-voice-manifest.mjs [--apply]",
      "",
      "Without --apply, performs a complete validation and prints the proposed manifest hashes.",
      "With --apply, preserves the retained manifest, mirrors and verifies changed-scene proof pairs,",
      "restores missing retained-scene alignments, and writes the local voice manifest last.",
      "This command never calls ElevenLabs or any other network provider.",
      "",
    ].join("\n"));
    return { help: true };
  }
  const allowedFlags = new Set(["--apply", "--dry-run"]);
  for (const argument of argv) invariant(allowedFlags.has(argument), `Unknown argument: ${argument}`);
  invariant(!(argv.includes("--apply") && argv.includes("--dry-run")), "Choose either --apply or --dry-run");
  return { help: false, apply: argv.includes("--apply"), voiceId: defaultVoiceId };
}

async function probeMp3(audioPath) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=format_name,duration,bit_rate:stream=index,codec_type,codec_name,sample_rate,channels,bit_rate",
      "-of", "json",
      audioPath,
    ], { encoding: "utf8", maxBuffer: 1024 * 1024 }));
  } catch (error) {
    throw new Error(`ffprobe failed for ${audioPath}: ${error.message}`);
  }
  const probe = parseJson(stdout, `ffprobe output for ${audioPath}`);
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  invariant(audioStreams.length === 1, `${audioPath} must contain exactly one audio stream`);
  invariant(streams.every((stream) => stream.codec_type === "audio"), `${audioPath} contains a non-audio stream`);
  const stream = audioStreams[0];
  const durationSeconds = Number(probe.format?.duration);
  const streamBitRate = Number(stream.bit_rate);
  invariant(probe.format?.format_name === "mp3" && stream.codec_name === "mp3", `${audioPath} is not MP3`);
  invariant(Number(stream.sample_rate) === 44_100, `${audioPath} is not 44.1 kHz`);
  invariant(Number.isInteger(Number(stream.channels)) && Number(stream.channels) >= 1, `${audioPath} has no audio channels`);
  invariant(Number.isFinite(durationSeconds) && durationSeconds > 0.25, `${audioPath} has no usable duration`);
  invariant(
    Number.isFinite(streamBitRate) && streamBitRate >= 120_000 && streamBitRate <= 136_000,
    `${audioPath} is not a 128 kbps MP3 stream`,
  );
  return { durationSeconds, sampleRate: Number(stream.sample_rate), bitRate: streamBitRate };
}

export function validateAlignmentRecord({
  record,
  expectedText,
  scene,
  audioSha256,
  audioBytes,
  audioDurationSeconds,
  scriptSha256,
}) {
  invariant(record && typeof record === "object", `Scene ${scene} alignment must be an object`);
  invariant(record.text === expectedText, `Scene ${scene} alignment text does not match SCRIPT.md`);
  invariant(record.originalAlignment === null, `Scene ${scene} must not claim provider-native alignment`);
  const alignment = record.alignment;
  const characters = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;
  invariant(
    Array.isArray(characters) && Array.isArray(starts) && Array.isArray(ends),
    `Scene ${scene} alignment arrays are missing`,
  );
  invariant(characters.join("") === expectedText, `Scene ${scene} alignment characters are not exact`);
  invariant(
    characters.length === starts.length && characters.length === ends.length && characters.length > 0,
    `Scene ${scene} alignment array lengths differ`,
  );
  let positiveDurations = 0;
  for (let index = 0; index < characters.length; index += 1) {
    const start = Number(starts[index]);
    const end = Number(ends[index]);
    invariant(Number.isFinite(start) && Number.isFinite(end), `Scene ${scene} has non-finite character timing`);
    invariant(start >= 0 && end >= start, `Scene ${scene} has invalid character timing`);
    if (end > start) positiveDurations += 1;
    if (index > 0) {
      invariant(start >= Number(starts[index - 1]), `Scene ${scene} character starts are not monotonic`);
      invariant(end >= Number(ends[index - 1]), `Scene ${scene} character ends are not monotonic`);
    }
  }
  invariant(positiveDurations > 0, `Scene ${scene} alignment has no positive timing spans`);
  invariant(
    Number(ends.at(-1)) <= audioDurationSeconds + 0.002,
    `Scene ${scene} alignment exceeds the MP3 duration`,
  );

  const metadata = record.metadata;
  invariant(metadata?.schemaVersion === 1, `Scene ${scene} alignment metadata schema is invalid`);
  invariant(metadata.source === alignmentSource, `Scene ${scene} alignment source is not approved`);
  invariant(metadata.providerAlignmentAvailable === false, `Scene ${scene} incorrectly claims provider alignment`);
  invariant(metadata.scene === scene, `Scene ${scene} alignment metadata scene differs`);
  invariant(metadata.qualityGate === "passed", `Scene ${scene} alignment quality gate did not pass`);
  invariant(metadata.audioSha256 === audioSha256, `Scene ${scene} alignment/audio SHA-256 differs`);
  invariant(metadata.audioBytes === audioBytes, `Scene ${scene} alignment/audio byte count differs`);
  invariant(
    Math.abs(Number(metadata.audioDurationSeconds) - audioDurationSeconds) <= 0.002,
    `Scene ${scene} alignment/audio duration differs`,
  );
  invariant(metadata.scriptSha256 === scriptSha256, `Scene ${scene} alignment SCRIPT.md hash is stale`);
  invariant(metadata.textSha256 === sha256(expectedText), `Scene ${scene} alignment text hash is stale`);
  invariant(
    Number.isFinite(Number(metadata.independentCharacterErrorRate))
      && Number(metadata.independentCharacterErrorRate) <= maxAlignmentCer,
    `Scene ${scene} independent transcript quality exceeds the safety gate`,
  );
  invariant(
    Number(metadata.maxIndependentCharacterErrorRate) <= maxAlignmentCer,
    `Scene ${scene} alignment was produced with a relaxed quality gate`,
  );
  return {
    source: metadata.source,
    model: metadata.model,
    modelRevision: metadata.modelRevision,
    characterErrorRate: Number(metadata.independentCharacterErrorRate),
    alignmentEndSeconds: Number(ends.at(-1)),
  };
}

async function validateCaptureLock(captureLockSource) {
  const captureLock = parseJson(captureLockSource, "capture-lock.json");
  invariant(captureLock.schemaVersion === 1, "Capture lock schema is invalid");
  invariant(captureLock.status === "approved-canonical-captures", "Canonical captures are not approved");
  invariant(typeof captureLock.approvedAt === "string" && captureLock.approvedAt, "Capture lock has no approval time");
  invariant(Array.isArray(captureLock.captures), "Capture lock entries are missing");
  invariant(
    sameJson(captureLock.captures.map((capture) => capture.id), expectedCaptureIds),
    "Capture lock does not contain the exact canonical capture set",
  );
  for (const capture of captureLock.captures) {
    const capturePath = resolve(projectDir, capture.path);
    requireProjectPath(capturePath, `Capture ${capture.id}`);
    const bytes = await readFile(capturePath);
    invariant(bytes.length === capture.bytes, `Capture ${capture.id} byte count differs from lock`);
    invariant(sha256(bytes) === capture.sha256, `Capture ${capture.id} SHA-256 differs from lock`);
  }
  return {
    approvedAt: captureLock.approvedAt,
    sha256: sha256(captureLockSource),
  };
}

async function validateRouteSource(routeSource) {
  invariant(
    routeSource.includes(`const ELEVENLABS_MODEL = "${providerModel}";`),
    "Provider helper model does not match the generation ledger",
  );
  invariant(
    routeSource.includes(`const ELEVENLABS_OUTPUT_FORMAT = "${outputFormat}";`),
    "Provider helper output format does not match the generation ledger",
  );
  invariant(
    routeSource.includes(`const ELEVENLABS_DEFAULT_VOICE_ID = "${defaultVoiceId}";`),
    "Provider helper default voice differs from the generation ledger",
  );
  invariant(routeSource.includes("apply_text_normalization: \"auto\""), "Provider helper normalization contract differs");
  invariant(routeSource.includes("/stream"), "Provider helper is not the streaming ElevenLabs implementation");
  invariant(!routeSource.includes("voice_settings:"), "Provider helper unexpectedly overrides ElevenLabs voice settings");
  return sha256(routeSource);
}

function validateGenerationLedger(ledgerSource, scriptLines, sceneFacts, voiceId) {
  const ledger = parseJson(ledgerSource, "Narration generation ledger");
  const expectedLedgerKeys = [
    "schemaVersion",
    "sanitized",
    "containsCredentials",
    "provider",
    "model",
    "outputFormat",
    "voiceId",
    "generationRoute",
    "endpointClass",
    "canonicalProductAliasPromoted",
    "callSummary",
    "deployments",
    "scenes",
    "superseded",
  ].sort();
  invariant(sameJson(Object.keys(ledger).sort(), expectedLedgerKeys), "Narration generation ledger fields differ");
  invariant(ledger.schemaVersion === 1, "Narration generation ledger schema is invalid");
  invariant(ledger.sanitized === true && ledger.containsCredentials === false, "Narration generation ledger is not sanitized");
  invariant(ledger.provider === provider, "Narration generation ledger provider differs");
  invariant(ledger.model === providerModel, "Narration generation ledger model differs");
  invariant(ledger.outputFormat === outputFormat, "Narration generation ledger output format differs");
  invariant(ledger.voiceId === voiceId && voiceId === defaultVoiceId, "Narration generation ledger voice differs");
  invariant(ledger.generationRoute === generationLedgerRoute, "Narration generation ledger route differs");
  invariant(ledger.endpointClass === generationEndpointClass, "Narration generation endpoint class differs");
  invariant(ledger.canonicalProductAliasPromoted === false, "Narration generation must not claim canonical-product-alias promotion");
  invariant(sameJson(ledger.deployments, generationDeployments), "Narration generation deployment candidates differ");
  const callSummary = ledger.callSummary ?? {};
  invariant(
    sameJson(
      Object.keys(callSummary).sort(),
      ["callsPerFinalExactText", "finalFixedScenes", "selectedCalls", "supersededOverBudgetCalls", "totalProviderCalls"],
    ),
    "Narration generation call-summary fields differ",
  );
  invariant(sameJson(callSummary.finalFixedScenes, changedScenes), "Narration generation fixed-scene scope differs");
  invariant(callSummary.callsPerFinalExactText === 1, "Narration generation must record one call per selected exact text");
  invariant(callSummary.selectedCalls === changedScenes.length, "Narration generation selected-call count differs");
  invariant(callSummary.supersededOverBudgetCalls === 4, "Narration generation superseded-call count differs");
  invariant(callSummary.totalProviderCalls === 9, "Narration generation total call count differs");
  invariant(Array.isArray(ledger.scenes) && ledger.scenes.length === changedScenes.length, "Narration generation ledger scene count differs");

  const factsByScene = new Map(sceneFacts.map((fact) => [fact.scene, fact]));
  for (const [ledgerIndex, scene] of changedScenes.entries()) {
    const entry = ledger.scenes[ledgerIndex];
    const fact = factsByScene.get(scene);
    invariant(
      sameJson(
        Object.keys(entry ?? {}).sort(),
        ["bytes", "characters", "deploymentId", "deploymentUrl", "generatedAt", "scene", "sha256"],
      ),
      `Narration generation ledger scene ${scene} fields differ`,
    );
    invariant(entry.scene === scene, `Narration generation ledger scene ${scene} is missing or out of order`);
    invariant(entry.characters === scriptLines[scene - 1].length, `Narration generation ledger scene ${scene} character count differs`);
    invariant(entry.bytes === fact?.bytes, `Narration generation ledger scene ${scene} byte count differs from audio`);
    invariant(entry.sha256 === fact?.sha256, `Narration generation ledger scene ${scene} SHA-256 differs from audio`);
    invariant(typeof entry.generatedAt === "string" && !Number.isNaN(Date.parse(entry.generatedAt)), `Narration generation ledger scene ${scene} timestamp is invalid`);
    const expectedDeployment = generationDeploymentByScene.get(scene);
    invariant(entry.deploymentId === expectedDeployment?.deploymentId, `Narration generation ledger scene ${scene} deployment ID differs`);
    invariant(entry.deploymentUrl === expectedDeployment?.deploymentUrl, `Narration generation ledger scene ${scene} deployment URL differs`);
  }

  invariant(Array.isArray(ledger.superseded) && ledger.superseded.length === 4, "Narration generation superseded attempts differ");
  const expectedSupersededScenes = [5, 5, 6, 8];
  const expectedSupersededDeployments = [generationDeployments[1], generationDeployments[0], generationDeployments[0], generationDeployments[0]];
  const selectedHashes = new Set(ledger.scenes.map((entry) => entry.sha256));
  const supersededHashes = new Set();
  for (const [attemptIndex, entry] of ledger.superseded.entries()) {
    invariant(
      sameJson(
        Object.keys(entry ?? {}).sort(),
        ["bytes", "characters", "deploymentId", "deploymentUrl", "generatedAt", "reason", "scene", "sha256"],
      ),
      `Narration superseded attempt ${attemptIndex + 1} fields differ`,
    );
    invariant(entry.scene === expectedSupersededScenes[attemptIndex], `Narration superseded attempt ${attemptIndex + 1} scene differs`);
    invariant(Number.isInteger(entry.characters) && entry.characters > 0, `Narration superseded attempt ${attemptIndex + 1} character count is invalid`);
    invariant(Number.isInteger(entry.bytes) && entry.bytes > 10_000, `Narration superseded attempt ${attemptIndex + 1} byte count is invalid`);
    invariant(/^[a-f0-9]{64}$/u.test(entry.sha256), `Narration superseded attempt ${attemptIndex + 1} SHA-256 is invalid`);
    invariant(!selectedHashes.has(entry.sha256) && !supersededHashes.has(entry.sha256), `Narration superseded attempt ${attemptIndex + 1} SHA-256 is not unique`);
    invariant(typeof entry.generatedAt === "string" && !Number.isNaN(Date.parse(entry.generatedAt)), `Narration superseded attempt ${attemptIndex + 1} timestamp is invalid`);
    invariant(/^\d+\.\d{3}s exceeded the \d+\.\d{3}s scene budget$/u.test(entry.reason), `Narration superseded attempt ${attemptIndex + 1} reason is invalid`);
    invariant(entry.deploymentId === expectedSupersededDeployments[attemptIndex].deploymentId, `Narration superseded attempt ${attemptIndex + 1} deployment ID differs`);
    invariant(entry.deploymentUrl === expectedSupersededDeployments[attemptIndex].deploymentUrl, `Narration superseded attempt ${attemptIndex + 1} deployment URL differs`);
    supersededHashes.add(entry.sha256);
  }
  invariant(
    ledger.scenes.length + ledger.superseded.length === callSummary.totalProviderCalls,
    "Narration generation ledger entries do not equal its total call count",
  );

  return {
    path: generationLedgerProjectPath,
    sha256: sha256(ledgerSource),
    deployments: structuredClone(ledger.deployments),
    sceneDeploymentByScene: Object.fromEntries(
      ledger.scenes.map((entry) => [String(entry.scene), {
        deploymentId: entry.deploymentId,
        deploymentUrl: entry.deploymentUrl,
      }]),
    ),
    endpointClass: ledger.endpointClass,
    canonicalProductAliasPromoted: ledger.canonicalProductAliasPromoted,
    callsPerFinalExactText: callSummary.callsPerFinalExactText,
    selectedCalls: callSummary.selectedCalls,
    supersededOverBudgetCalls: callSummary.supersededOverBudgetCalls,
    totalProviderCalls: callSummary.totalProviderCalls,
  };
}

function validateRetainedProofManifest(proofManifestSource, manifest, scriptLines) {
  const proofManifest = parseJson(proofManifestSource, "Retained proof voice manifest");
  invariant(proofManifest.provider === provider, "Retained proof provider is not ElevenLabs");
  invariant(proofManifest.model === retainedProviderModel, "Retained proof model is not Multilingual v2");
  invariant(proofManifest.voiceId === defaultVoiceId, "Retained proof voice ID differs from George");
  invariant(proofManifest.outputFormat === outputFormat, "Retained proof output format differs");
  invariant(Array.isArray(proofManifest.scenes) && proofManifest.scenes.length === 9, "Retained proof manifest has no nine-scene package");
  for (const scene of unchangedScenes) {
    const index = scene - 1;
    const proofScene = proofManifest.scenes[index];
    const currentScene = manifest.scenes[index];
    invariant(proofScene?.scene === scene, `Retained proof scene ${scene} is missing or out of order`);
    invariant(proofScene.text === scriptLines[index], `Retained proof scene ${scene} text differs from SCRIPT.md`);
    for (const field of ["audio", "alignment", "durationSeconds", "bytes", "sha256"]) {
      invariant(
        proofScene[field] === currentScene[field],
        `Retained proof scene ${scene} ${field} differs from the current manifest`,
      );
    }
  }
  return {
    provider: proofManifest.provider,
    model: proofManifest.model,
    voiceId: proofManifest.voiceId,
    outputFormat: proofManifest.outputFormat,
    sha256: sha256(proofManifestSource),
  };
}

async function retainedProofArtifactPlan(proofManifestSource, proofManifestSha256) {
  const existingSha256 = await existingFileHash(retainedProofManifestPath);
  invariant(
    existingSha256 === null || existingSha256 === proofManifestSha256,
    "Immutable retained narration manifest differs from the validated pre-sync proof manifest",
  );
  return {
    path: retainedProofManifestPath,
    repoPath: retainedProofManifestRepoPath,
    source: proofManifestSource,
    sha256: proofManifestSha256,
    action: existingSha256 === null ? "copy" : "verified",
  };
}

async function proofAssetPlan({ scene, kind, targetPath, source, expectedSha256 }) {
  const existingSha256 = await existingFileHash(targetPath);
  return {
    scene,
    kind,
    targetPath,
    source,
    sha256: expectedSha256,
    action: existingSha256 === expectedSha256 ? "verified" : "replace",
  };
}

async function validateUnchangedScenes(manifest, scriptLines) {
  const retainedAlignments = [];
  for (const scene of unchangedScenes) {
    const index = scene - 1;
    const id = String(scene).padStart(2, "0");
    const item = manifest.scenes[index];
    invariant(item?.scene === scene, `Manifest scene ${scene} is missing or out of order`);
    invariant(item.text === scriptLines[index], `Unchanged scene ${scene} wording differs from SCRIPT.md`);
    invariant(item.audio === `scene-${id}.mp3`, `Unchanged scene ${scene} audio filename differs`);
    const audioPath = join(voiceAssetDir, item.audio);
    requireProjectPath(audioPath, `Unchanged scene ${scene} audio`);
    const bytes = await readFile(audioPath);
    invariant(bytes.length === item.bytes, `Unchanged scene ${scene} audio byte count differs`);
    invariant(sha256(bytes) === item.sha256, `Unchanged scene ${scene} audio SHA-256 differs`);

    invariant(item.alignment === `scene-${id}-alignment.json`, `Unchanged scene ${scene} alignment filename differs`);
    const proofAlignmentPath = join(proofVoiceDir, item.alignment);
    const assetAlignmentPath = join(voiceAssetDir, item.alignment);
    const proofAlignmentSource = await readFile(proofAlignmentPath, "utf8");
    const proofAlignment = parseJson(proofAlignmentSource, `Retained scene ${scene} proof alignment`);
    invariant(proofAlignment.text === scriptLines[index], `Retained scene ${scene} proof alignment text differs`);
    const timing = proofAlignment.originalAlignment ?? proofAlignment.alignment;
    const characters = timing?.characters;
    const starts = timing?.character_start_times_seconds;
    const ends = timing?.character_end_times_seconds;
    invariant(
      Array.isArray(characters) && Array.isArray(starts) && Array.isArray(ends),
      `Retained scene ${scene} proof alignment arrays are missing`,
    );
    invariant(characters.join("") === scriptLines[index], `Retained scene ${scene} proof alignment characters differ`);
    invariant(
      characters.length === starts.length && characters.length === ends.length && characters.length > 0,
      `Retained scene ${scene} proof alignment lengths differ`,
    );
    for (let timingIndex = 0; timingIndex < characters.length; timingIndex += 1) {
      const start = Number(starts[timingIndex]);
      const end = Number(ends[timingIndex]);
      invariant(Number.isFinite(start) && Number.isFinite(end), `Retained scene ${scene} timing is non-finite`);
      invariant(start >= 0 && end >= start, `Retained scene ${scene} timing is invalid`);
      if (timingIndex > 0) {
        invariant(start >= Number(starts[timingIndex - 1]), `Retained scene ${scene} starts are not monotonic`);
        invariant(end >= Number(ends[timingIndex - 1]), `Retained scene ${scene} ends are not monotonic`);
      }
    }
    invariant(
      Number(ends.at(-1)) <= Number(item.durationSeconds) + 0.002,
      `Retained scene ${scene} proof alignment exceeds its manifest duration`,
    );
    const sourceSha256 = sha256(proofAlignmentSource);
    let action = "copy";
    try {
      const existingSource = await readFile(assetAlignmentPath, "utf8");
      invariant(
        sha256(existingSource) === sourceSha256,
        `Retained scene ${scene} asset alignment differs from the proof package`,
      );
      action = "verified";
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    retainedAlignments.push({
      scene,
      name: item.alignment,
      sourcePath: proofAlignmentPath,
      targetPath: assetAlignmentPath,
      source: proofAlignmentSource,
      sha256: sourceSha256,
      action,
    });
  }
  return retainedAlignments;
}

async function validateChangedScene(scene, scriptLines, scriptDigest) {
  const index = scene - 1;
  const id = String(scene).padStart(2, "0");
  const audioName = `scene-${id}.mp3`;
  const alignmentName = `scene-${id}-alignment.json`;
  const audioPath = join(voiceAssetDir, audioName);
  const alignmentPath = join(voiceAssetDir, alignmentName);
  requireProjectPath(audioPath, `Scene ${scene} audio`);
  requireProjectPath(alignmentPath, `Scene ${scene} alignment`);
  const audioBytes = await readRequired(audioPath, undefined, `Scene ${scene} MP3`);
  const alignmentSourceText = await readRequired(alignmentPath, "utf8", `Scene ${scene} alignment`);
  const probe = await probeMp3(audioPath);
  invariant(audioBytes.length >= 10_000, `Scene ${scene} audio file is not usable`);
  const audioDigest = sha256(audioBytes);
  const sceneBudget = sceneEnds[index] - sceneStarts[index];
  invariant(
    probe.durationSeconds <= sceneBudget + 0.015,
    `Scene ${scene} audio is ${probe.durationSeconds.toFixed(3)}s, outside its ${sceneBudget.toFixed(3)}s frame budget`,
  );
  const record = parseJson(alignmentSourceText, `Scene ${scene} alignment`);
  const alignment = validateAlignmentRecord({
    record,
    expectedText: scriptLines[index],
    scene,
    audioSha256: audioDigest,
    audioBytes: audioBytes.length,
    audioDurationSeconds: probe.durationSeconds,
    scriptSha256: scriptDigest,
  });
  const alignmentDigest = sha256(alignmentSourceText);
  const proofAssets = await Promise.all([
    proofAssetPlan({
      scene,
      kind: "audio",
      targetPath: join(proofVoiceDir, audioName),
      source: audioBytes,
      expectedSha256: audioDigest,
    }),
    proofAssetPlan({
      scene,
      kind: "alignment",
      targetPath: join(proofVoiceDir, alignmentName),
      source: alignmentSourceText,
      expectedSha256: alignmentDigest,
    }),
  ]);
  return {
    scene,
    text: scriptLines[index],
    audio: audioName,
    alignment: alignmentName,
    durationSeconds: Number(probe.durationSeconds.toFixed(6)),
    bytes: audioBytes.length,
    sha256: audioDigest,
    alignmentSha256: alignmentDigest,
    alignmentRecord: alignment,
    proofAssets,
  };
}

export function buildNextManifest({
  manifest,
  sceneFacts,
  scriptDigest,
  captureLock,
  retainedProof,
  routeSourceSha256,
  generationLedger,
  voiceId,
  generatedAt,
}) {
  invariant(Array.isArray(manifest.scenes) && manifest.scenes.length === 9, "Voiceover manifest must contain nine scenes");
  const unchangedBefore = new Map(unchangedScenes.map((scene) => [scene, structuredClone(manifest.scenes[scene - 1])]));
  const next = structuredClone(manifest);
  for (const fact of sceneFacts) {
    const {
      alignmentSha256: ignoredAlignmentSha256,
      alignmentRecord: ignoredAlignmentRecord,
      proofAssets: ignoredProofAssets,
      ...sceneEntry
    } = fact;
    void ignoredAlignmentSha256;
    void ignoredAlignmentRecord;
    void ignoredProofAssets;
    next.scenes[fact.scene - 1] = {
      ...sceneEntry,
      provider,
      model: providerModel,
      voiceId,
      outputFormat,
      generationRoute: generationRouteLabel,
      generationDeploymentId: generationLedger.sceneDeploymentByScene[String(fact.scene)].deploymentId,
      generationDeploymentUrl: generationLedger.sceneDeploymentByScene[String(fact.scene)].deploymentUrl,
      providerAlignmentAvailable: false,
      alignmentSource,
    };
  }
  for (const [scene, before] of unchangedBefore) {
    invariant(sameJson(next.scenes[scene - 1], before), `Manifest sync attempted to alter unchanged scene ${scene}`);
  }

  next.generatedAt = generatedAt;
  next.status = "generated-awaiting-caption-sync";
  next.regenerateAfterApprovedCaptures = false;
  next.changedScenesPendingRegeneration = [];
  next.unchangedScenesRetained = [...unchangedScenes];
  next.captionSyncRequired = true;
  next.captureLockAcknowledged = true;
  next.captureLockApprovedAt = captureLock.approvedAt;
  next.captureLockSha256 = captureLock.sha256;
  next.scriptSha256 = scriptDigest;
  next.provider = provider;
  next.model = "mixed";
  next.modelsByScene = {
    [retainedProviderModel]: [...unchangedScenes],
    [providerModel]: [...changedScenes],
  };
  next.retainedNarration = {
    scenes: [...unchangedScenes],
    provider: retainedProof.provider,
    model: retainedProof.model,
    voiceId: retainedProof.voiceId,
    outputFormat: retainedProof.outputFormat,
    proofManifestPath: retainedProofManifestRepoPath,
    proofManifestSha256: retainedProof.sha256,
  };
  next.voiceId = voiceId === retainedProof.voiceId ? voiceId : "mixed";
  next.voiceIdsByScene = voiceId === retainedProof.voiceId
    ? { [voiceId]: [1, 2, 3, 4, 5, 6, 7, 8, 9] }
    : {
        [retainedProof.voiceId]: [...unchangedScenes],
        [voiceId]: [...changedScenes],
      };
  next.outputFormat = outputFormat;
  next.source = "video/finaltab-winner/SCRIPT.md";
  next.purpose = "Scenes 3, 4, 5, 6, and 8 are the selected ElevenLabs Flash v2.5 MP3s from protected, expiring, fixed-scene Vercel release candidates. The ledger records one call per selected exact text plus four superseded over-budget attempts; scenes 1, 2, 7, and 9 retain their approved Multilingual v2 audio. Captions are pending synchronization.";
  next.generationLedger = {
    path: generationLedger.path,
    sha256: generationLedger.sha256,
  };
  next.generationRoute = {
    scenes: [...changedScenes],
    method: "POST",
    path: generationEndpointPath,
    endpointClass: generationLedger.endpointClass,
    deployments: generationLedger.deployments,
    canonicalProductAliasPromoted: generationLedger.canonicalProductAliasPromoted,
    callsPerFinalExactText: generationLedger.callsPerFinalExactText,
    selectedCalls: generationLedger.selectedCalls,
    supersededOverBudgetCalls: generationLedger.supersededOverBudgetCalls,
    totalProviderCalls: generationLedger.totalProviderCalls,
    generationLedgerPath: generationLedger.path,
    generationLedgerSha256: generationLedger.sha256,
    implementation: "protected expiring fixed-scene Vercel release endpoint",
    providerImplementation: "apps/web/lib/server/voice.ts",
    providerSourceSha256: routeSourceSha256,
    responseContentType: "audio/mpeg",
    applyTextNormalization: "auto",
    voiceSettingsOverride: false,
    providerAlignmentReturned: false,
  };
  next.alignmentSource = {
    scenes: [...changedScenes],
    method: alignmentSource,
    providerAlignmentAvailable: false,
    sceneAlignmentSha256: Object.fromEntries(sceneFacts.map((fact) => [String(fact.scene), fact.alignmentSha256])),
  };
  next.proofVoicePackage = {
    directory: "proof-output/finaltab-winner/voiceover",
    changedScenes: [...changedScenes],
    changedSceneAssetsMirrored: true,
    retainedManifestPath: retainedProofManifestRepoPath,
    retainedManifestSha256: retainedProof.sha256,
  };
  next.voiceSettingsSource = "Scenes 3, 4, 5, 6, and 8 use ElevenLabs defaults because the protected release endpoints called the shared provider helper without a voice_settings override; retained scenes keep their approved package.";
  delete next.voiceSettings;
  delete next.scriptUpdateRequired;
  delete next.captionAssets;
  return next;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return;
  const [scriptSource, manifestSource, captureLockSource, routeSource, proofManifestSource, generationLedgerSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(manifestPath, "utf8"),
    readFile(captureLockPath, "utf8"),
    readFile(routeSourcePath, "utf8"),
    readRetainedProofSource(),
    readFile(generationLedgerPath, "utf8"),
  ]);
  const scriptLines = [...scriptSource.matchAll(/^ {4}(.+)$/gm)].map((match) => match[1].trim());
  invariant(scriptLines.length === 9 && scriptLines.every(Boolean), "SCRIPT.md must contain exactly nine narration lines");
  const scriptDigest = sha256(canonicalSource(scriptSource));
  const manifest = parseJson(manifestSource, "voiceover-manifest.json");
  invariant(Array.isArray(manifest.scenes) && manifest.scenes.length === 9, "Voiceover manifest must contain exactly nine scenes");
  const retainedProof = validateRetainedProofManifest(proofManifestSource, manifest, scriptLines);
  const [retainedProofArtifact, retainedAlignments, captureLock, routeSourceSha256] = await Promise.all([
    retainedProofArtifactPlan(proofManifestSource, retainedProof.sha256),
    validateUnchangedScenes(manifest, scriptLines),
    validateCaptureLock(captureLockSource),
    validateRouteSource(routeSource),
  ]);
  const sceneFacts = [];
  for (const scene of changedScenes) {
    sceneFacts.push(await validateChangedScene(scene, scriptLines, scriptDigest));
  }
  const generationLedger = validateGenerationLedger(
    generationLedgerSource,
    scriptLines,
    sceneFacts,
    options.voiceId,
  );
  const generatedAt = new Date().toISOString();
  const next = buildNextManifest({
    manifest,
    sceneFacts,
    scriptDigest,
    captureLock,
    retainedProof,
    routeSourceSha256,
    generationLedger,
    voiceId: options.voiceId,
    generatedAt,
  });
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const report = {
    ok: true,
    mode: options.apply ? "apply" : "dry-run",
    provider,
    model: next.model,
    changedSceneModel: providerModel,
    modelsByScene: next.modelsByScene,
    outputFormat,
    manifestPath,
    currentManifestSha256: sha256(manifestSource),
    nextManifestSha256: sha256(serialized),
    captureLockSha256: captureLock.sha256,
    retainedProofManifestSha256: retainedProof.sha256,
    generationLedger,
    retainedProofManifest: {
      path: retainedProofArtifact.repoPath,
      action: retainedProofArtifact.action,
      sha256: retainedProofArtifact.sha256,
    },
    status: next.status,
    captureLockAcknowledged: next.captureLockAcknowledged,
    retainedAlignments: retainedAlignments.map((alignment) => ({
      scene: alignment.scene,
      action: alignment.action,
      sha256: alignment.sha256,
    })),
    changedScenes: sceneFacts.map((fact) => ({
      scene: fact.scene,
      durationSeconds: fact.durationSeconds,
      bytes: fact.bytes,
      sha256: fact.sha256,
      alignmentSha256: fact.alignmentSha256,
      alignmentCharacterErrorRate: fact.alignmentRecord.characterErrorRate,
      proofAssets: fact.proofAssets.map((asset) => ({
        kind: asset.kind,
        action: asset.action,
        sha256: asset.sha256,
      })),
    })),
  };
  if (options.apply) {
    if (retainedProofArtifact.action === "copy") {
      await atomicReplace(
        retainedProofArtifact.path,
        retainedProofArtifact.source,
        retainedProofArtifact.sha256,
        "Immutable retained narration manifest",
      );
    }
    for (const asset of sceneFacts.flatMap((fact) => fact.proofAssets).filter((item) => item.action !== "verified")) {
      await atomicReplace(
        asset.targetPath,
        asset.source,
        asset.sha256,
        `Proof scene ${asset.scene} ${asset.kind}`,
      );
    }
    for (const alignment of retainedAlignments.filter((item) => item.action === "copy")) {
      await atomicReplace(
        alignment.targetPath,
        alignment.source,
        alignment.sha256,
        `Retained scene ${alignment.scene} alignment`,
      );
    }
    await atomicReplace(
      manifestPath,
      serialized,
      report.nextManifestSha256,
      "Voiceover manifest",
      false,
    );
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === currentPath.toLowerCase() : invokedPath === currentPath) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  });
}
