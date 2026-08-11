import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const allowPlaceholders = process.argv.includes("--allow-placeholders");
const expected = {
  duration: 96,
  width: 3840,
  height: 2160,
  fps: 60,
  chainId: 84532,
  executionId: "3hmlqi36zweiwg6fc5o2u",
  transactionHash: "0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789",
  blockNumber: 45327128,
  settlementId: "0x8b670800d9856a90baa7492adefaf06ae86ac345d053db3dc7f01b065aadb9db",
  ledgerHash: "0x1581eb7f56485ff4d2a684a832fc8d085b9b0e5d8540c85e2d550e8f7b0cb91e",
  amountAtomic: "1",
  retainedVoiceScenes: [1, 2, 7, 9],
  changedVoiceScenes: [3, 4, 5, 6, 8],
  voiceProvider: "ElevenLabs",
  retainedVoiceModel: "eleven_multilingual_v2",
  changedVoiceModel: "eleven_flash_v2_5",
  voiceOutputFormat: "mp3_44100_128",
  changedVoiceRoute: "POST /api/internal/video-narration",
  generationLedgerRoute: "POST /api/internal/video-narration (protected, expiring release endpoint)",
  generationEndpointClass: "protected-expiring-fixed-scene-release",
  generationDeployments: [
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
  ],
  generationDeploymentIndexByScene: { 3: 0, 4: 0, 5: 2, 6: 1, 8: 1 },
  generationLedgerPath: "data/narration-generation-ledger.json",
  generationVoiceId: "JBFqnCBsd6RMkjVDRZzb",
  changedAlignmentSource: "offline-faster-whisper-transcript-constrained",
  proofVoiceDirectory: "proof-output/finaltab-winner/voiceover",
  retainedVoiceProofManifest: "proof-output/finaltab-winner/voiceover/retained-multilingual-v2-manifest.json",
  productionTools: [
    "split_equal",
    "split_weighted",
    "net_debts",
    "allocate_receipt",
    "prepare_receipt_settlement",
    "simulate_signed_settlement",
    "create_broadcast_approval_challenge",
    "submit_signed_settlement",
    "settlement_status",
  ],
};

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSource(value) {
  return value.replace(/\r\n?/gu, "\n");
}

function sameOrderedArray(value, expectedValue) {
  return Array.isArray(value)
    && value.length === expectedValue.length
    && value.every((item, indexValue) => item === expectedValue[indexValue]);
}

function sha256Digest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function canonicalText(value) {
  return value.replace(/\s+/gu, " ").replace(/\s*—\s*/gu, "—").trim();
}

function html(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function readJson(...parts) {
  return JSON.parse(await readFile(join(projectDir, ...parts), "utf8"));
}

async function validateNarrationGenerationLedger(scriptLines) {
  const source = await readFile(join(projectDir, ...expected.generationLedgerPath.split("/")), "utf8");
  const ledger = JSON.parse(source);
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
  invariant(JSON.stringify(Object.keys(ledger).sort()) === JSON.stringify(expectedLedgerKeys), "Narration generation ledger fields differ");
  invariant(ledger.schemaVersion === 1, "Narration generation ledger schema is invalid");
  invariant(ledger.sanitized === true && ledger.containsCredentials === false, "Narration generation ledger is not sanitized");
  invariant(ledger.provider === expected.voiceProvider, "Narration generation ledger provider differs");
  invariant(ledger.model === expected.changedVoiceModel, "Narration generation ledger model differs");
  invariant(ledger.outputFormat === expected.voiceOutputFormat, "Narration generation ledger output format differs");
  invariant(ledger.voiceId === expected.generationVoiceId, "Narration generation ledger voice ID differs");
  invariant(ledger.generationRoute === expected.generationLedgerRoute, "Narration generation ledger route differs");
  invariant(ledger.endpointClass === expected.generationEndpointClass, "Narration generation endpoint class differs");
  invariant(ledger.canonicalProductAliasPromoted === false, "Narration generation ledger incorrectly claims canonical-product-alias promotion");
  invariant(JSON.stringify(ledger.deployments) === JSON.stringify(expected.generationDeployments), "Narration generation deployment candidates differ");

  const callSummary = ledger.callSummary ?? {};
  invariant(
    JSON.stringify(Object.keys(callSummary).sort()) === JSON.stringify([
      "callsPerFinalExactText",
      "finalFixedScenes",
      "selectedCalls",
      "supersededOverBudgetCalls",
      "totalProviderCalls",
    ]),
    "Narration generation call-summary fields differ",
  );
  invariant(sameOrderedArray(callSummary.finalFixedScenes, expected.changedVoiceScenes), "Narration generation fixed-scene scope differs");
  invariant(callSummary.callsPerFinalExactText === 1, "Narration generation ledger does not record one call per selected exact text");
  invariant(callSummary.selectedCalls === expected.changedVoiceScenes.length, "Narration generation selected-call count differs");
  invariant(callSummary.supersededOverBudgetCalls === 4, "Narration generation superseded-call count differs");
  invariant(callSummary.totalProviderCalls === 9, "Narration generation total call count differs");
  invariant(Array.isArray(ledger.scenes) && ledger.scenes.length === expected.changedVoiceScenes.length, "Narration generation ledger scene count differs");

  const sceneByNumber = new Map();
  for (const [ledgerIndex, scene] of expected.changedVoiceScenes.entries()) {
    const entry = ledger.scenes[ledgerIndex];
    invariant(
      JSON.stringify(Object.keys(entry ?? {}).sort()) === JSON.stringify([
        "bytes",
        "characters",
        "deploymentId",
        "deploymentUrl",
        "generatedAt",
        "scene",
        "sha256",
      ]),
      `Narration generation ledger scene ${scene} fields differ`,
    );
    invariant(entry.scene === scene, `Narration generation ledger scene ${scene} is missing or out of order`);
    invariant(entry.characters === scriptLines[scene - 1].length, `Narration generation ledger scene ${scene} character count differs`);
    invariant(Number.isInteger(entry.bytes) && entry.bytes > 10_000, `Narration generation ledger scene ${scene} byte count is invalid`);
    invariant(sha256Digest(entry.sha256), `Narration generation ledger scene ${scene} SHA-256 is invalid`);
    invariant(typeof entry.generatedAt === "string" && !Number.isNaN(Date.parse(entry.generatedAt)), `Narration generation ledger scene ${scene} timestamp is invalid`);
    const expectedDeployment = expected.generationDeployments[expected.generationDeploymentIndexByScene[scene]];
    invariant(entry.deploymentId === expectedDeployment.deploymentId, `Narration generation ledger scene ${scene} deployment ID differs`);
    invariant(entry.deploymentUrl === expectedDeployment.deploymentUrl, `Narration generation ledger scene ${scene} deployment URL differs`);
    const audio = await readFile(join(projectDir, "assets", "audio", "voice", `scene-${String(scene).padStart(2, "0")}.mp3`));
    invariant(audio.length === entry.bytes, `Narration generation ledger scene ${scene} byte count differs from audio`);
    invariant(sha256(audio) === entry.sha256, `Narration generation ledger scene ${scene} SHA-256 differs from audio`);
    sceneByNumber.set(scene, entry);
  }

  invariant(Array.isArray(ledger.superseded) && ledger.superseded.length === 4, "Narration generation superseded attempts differ");
  const expectedSupersededScenes = [5, 5, 6, 8];
  const expectedSupersededDeploymentIndexes = [1, 0, 0, 0];
  const selectedHashes = new Set(ledger.scenes.map((entry) => entry.sha256));
  const supersededHashes = new Set();
  for (const [attemptIndex, entry] of ledger.superseded.entries()) {
    invariant(
      JSON.stringify(Object.keys(entry ?? {}).sort()) === JSON.stringify([
        "bytes",
        "characters",
        "deploymentId",
        "deploymentUrl",
        "generatedAt",
        "reason",
        "scene",
        "sha256",
      ]),
      `Narration superseded attempt ${attemptIndex + 1} fields differ`,
    );
    invariant(entry.scene === expectedSupersededScenes[attemptIndex], `Narration superseded attempt ${attemptIndex + 1} scene differs`);
    invariant(Number.isInteger(entry.characters) && entry.characters > 0, `Narration superseded attempt ${attemptIndex + 1} character count is invalid`);
    invariant(Number.isInteger(entry.bytes) && entry.bytes > 10_000, `Narration superseded attempt ${attemptIndex + 1} byte count is invalid`);
    invariant(sha256Digest(entry.sha256), `Narration superseded attempt ${attemptIndex + 1} SHA-256 is invalid`);
    invariant(!selectedHashes.has(entry.sha256) && !supersededHashes.has(entry.sha256), `Narration superseded attempt ${attemptIndex + 1} SHA-256 is not unique`);
    invariant(typeof entry.generatedAt === "string" && !Number.isNaN(Date.parse(entry.generatedAt)), `Narration superseded attempt ${attemptIndex + 1} timestamp is invalid`);
    invariant(/^\d+\.\d{3}s exceeded the \d+\.\d{3}s scene budget$/u.test(entry.reason), `Narration superseded attempt ${attemptIndex + 1} reason is invalid`);
    const expectedDeployment = expected.generationDeployments[expectedSupersededDeploymentIndexes[attemptIndex]];
    invariant(entry.deploymentId === expectedDeployment.deploymentId, `Narration superseded attempt ${attemptIndex + 1} deployment ID differs`);
    invariant(entry.deploymentUrl === expectedDeployment.deploymentUrl, `Narration superseded attempt ${attemptIndex + 1} deployment URL differs`);
    supersededHashes.add(entry.sha256);
  }
  invariant(
    ledger.scenes.length + ledger.superseded.length === callSummary.totalProviderCalls,
    "Narration generation ledger entries do not equal its total call count",
  );

  return {
    ledger,
    sceneByNumber,
    sha256: sha256(source),
  };
}

async function validateHybridNarrationProvenance(manifest, generationEvidence) {
  invariant(manifest.provider === expected.voiceProvider, "Voice manifest provider is not ElevenLabs");
  invariant(manifest.model === "mixed", "Voice manifest must declare its mixed model package");
  invariant(manifest.outputFormat === expected.voiceOutputFormat, "Voice manifest output format differs");

  const modelsByScene = manifest.modelsByScene ?? {};
  const modelKeys = Object.keys(modelsByScene).sort();
  invariant(
    sameOrderedArray(modelKeys, [expected.changedVoiceModel, expected.retainedVoiceModel].sort()),
    "Voice manifest model groups are not exact",
  );
  invariant(
    sameOrderedArray(modelsByScene[expected.retainedVoiceModel], expected.retainedVoiceScenes),
    "Retained narration model scope differs",
  );
  invariant(
    sameOrderedArray(modelsByScene[expected.changedVoiceModel], expected.changedVoiceScenes),
    "Route-generated narration model scope differs",
  );

  const retained = manifest.retainedNarration ?? {};
  invariant(sameOrderedArray(retained.scenes, expected.retainedVoiceScenes), "Retained narration scene scope differs");
  invariant(retained.provider === expected.voiceProvider, "Retained narration provider differs");
  invariant(retained.model === expected.retainedVoiceModel, "Retained narration model differs");
  invariant(retained.outputFormat === expected.voiceOutputFormat, "Retained narration output format differs");
  invariant(/^[A-Za-z0-9_-]{8,128}$/u.test(retained.voiceId ?? ""), "Retained narration voice ID is invalid");
  invariant(retained.proofManifestPath === expected.retainedVoiceProofManifest, "Retained narration proof-manifest path differs");
  invariant(sha256Digest(retained.proofManifestSha256), "Retained narration proof-manifest hash is invalid");
  const proofPackage = manifest.proofVoicePackage ?? {};
  invariant(proofPackage.directory === expected.proofVoiceDirectory, "Proof voice-package directory differs");
  invariant(sameOrderedArray(proofPackage.changedScenes, expected.changedVoiceScenes), "Proof voice-package scene scope differs");
  invariant(proofPackage.changedSceneAssetsMirrored === true, "Changed narration assets are not marked mirrored");
  invariant(proofPackage.retainedManifestPath === retained.proofManifestPath, "Proof voice-package retained manifest path differs");
  invariant(proofPackage.retainedManifestSha256 === retained.proofManifestSha256, "Proof voice-package retained manifest hash differs");
  const repoRoot = join(projectDir, "..", "..");
  const proofVoiceDir = join(repoRoot, ...expected.proofVoiceDirectory.split("/"));
  const retainedProofSource = await readFile(join(repoRoot, ...retained.proofManifestPath.split("/")), "utf8");
  invariant(sha256(retainedProofSource) === retained.proofManifestSha256, "Retained narration proof-manifest hash is stale");
  const retainedProof = JSON.parse(retainedProofSource);
  invariant(retainedProof.provider === expected.voiceProvider, "Retained proof provider differs");
  invariant(retainedProof.model === expected.retainedVoiceModel, "Retained proof model differs");
  invariant(retainedProof.voiceId === retained.voiceId, "Retained proof voice ID differs");
  invariant(retainedProof.outputFormat === expected.voiceOutputFormat, "Retained proof output format differs");
  invariant(Array.isArray(retainedProof.scenes) && retainedProof.scenes.length === 9, "Retained proof scene package differs");
  for (const scene of expected.retainedVoiceScenes) {
    const retainedScene = retainedProof.scenes[scene - 1];
    const item = manifest.scenes[scene - 1];
    invariant(retainedScene?.scene === scene && retainedScene.text === item.text, `Retained proof scene ${scene} text differs`);
    for (const field of ["audio", "alignment", "durationSeconds", "bytes", "sha256"]) {
      invariant(retainedScene[field] === item[field], `Retained proof scene ${scene} ${field} differs`);
    }
  }

  const generationLedger = manifest.generationLedger ?? {};
  invariant(generationLedger.path === expected.generationLedgerPath, "Voice manifest generation-ledger path differs");
  invariant(generationLedger.sha256 === generationEvidence.sha256, "Voice manifest generation-ledger hash differs");
  const route = manifest.generationRoute ?? {};
  invariant(sameOrderedArray(route.scenes, expected.changedVoiceScenes), "Narration route scene scope differs");
  invariant(route.method === "POST" && route.path === "/api/internal/video-narration", "Narration generation route differs");
  invariant(route.endpointClass === generationEvidence.ledger.endpointClass, "Narration generation endpoint class differs");
  invariant(JSON.stringify(route.deployments) === JSON.stringify(generationEvidence.ledger.deployments), "Narration generation deployments differ");
  invariant(route.canonicalProductAliasPromoted === false, "Narration generation incorrectly claims canonical-product-alias promotion");
  invariant(route.callsPerFinalExactText === 1, "Narration generation selected-text call count differs");
  invariant(route.selectedCalls === expected.changedVoiceScenes.length, "Narration generation selected-call count differs");
  invariant(route.supersededOverBudgetCalls === 4 && route.totalProviderCalls === 9, "Narration generation total call accounting differs");
  invariant(route.generationLedgerPath === expected.generationLedgerPath, "Narration route generation-ledger path differs");
  invariant(route.generationLedgerSha256 === generationEvidence.sha256, "Narration route generation-ledger hash differs");
  invariant(route.implementation === "protected expiring fixed-scene Vercel release endpoint", "Narration route implementation differs");
  invariant(route.providerImplementation === "apps/web/lib/server/voice.ts", "Narration provider implementation differs");
  invariant(route.responseContentType === "audio/mpeg", "Narration route response type differs");
  invariant(route.applyTextNormalization === "auto", "Narration text-normalization contract differs");
  invariant(route.voiceSettingsOverride === false, "Narration route incorrectly claims a voice-settings override");
  invariant(route.providerAlignmentReturned === false, "Narration route incorrectly claims provider alignment");
  invariant(sha256Digest(route.providerSourceSha256), "Narration provider-source hash is invalid");
  const routeSource = await readFile(join(projectDir, "..", "..", "apps", "web", "lib", "server", "voice.ts"), "utf8");
  invariant(route.providerSourceSha256 === sha256(routeSource), "Narration provider-source hash is stale");

  const alignmentSource = manifest.alignmentSource ?? {};
  invariant(sameOrderedArray(alignmentSource.scenes, expected.changedVoiceScenes), "Offline alignment scene scope differs");
  invariant(alignmentSource.method === expected.changedAlignmentSource, "Offline alignment method differs");
  invariant(alignmentSource.providerAlignmentAvailable === false, "Offline alignment incorrectly claims provider timing");
  const alignmentHashes = alignmentSource.sceneAlignmentSha256 ?? {};
  invariant(
    sameOrderedArray(Object.keys(alignmentHashes).sort(), expected.changedVoiceScenes.map(String).sort()),
    "Offline alignment hash keys differ",
  );

  for (const scene of expected.changedVoiceScenes) {
    const item = manifest.scenes[scene - 1];
    const ledgerEntry = generationEvidence.sceneByNumber.get(scene);
    invariant(item.provider === expected.voiceProvider, `Scene ${scene} provider differs`);
    invariant(item.model === expected.changedVoiceModel, `Scene ${scene} model differs`);
    invariant(item.outputFormat === expected.voiceOutputFormat, `Scene ${scene} output format differs`);
    invariant(item.generationRoute === expected.changedVoiceRoute, `Scene ${scene} generation route differs`);
    invariant(item.generationDeploymentId === ledgerEntry.deploymentId, `Scene ${scene} deployment ID differs from the generation ledger`);
    invariant(item.generationDeploymentUrl === ledgerEntry.deploymentUrl, `Scene ${scene} deployment URL differs from the generation ledger`);
    invariant(item.voiceId === generationEvidence.ledger.voiceId, `Scene ${scene} voice ID differs from the generation ledger`);
    invariant(item.bytes === ledgerEntry.bytes, `Scene ${scene} byte count differs from the generation ledger`);
    invariant(item.sha256 === ledgerEntry.sha256, `Scene ${scene} SHA-256 differs from the generation ledger`);
    invariant(item.providerAlignmentAvailable === false, `Scene ${scene} incorrectly claims provider alignment`);
    invariant(item.alignmentSource === expected.changedAlignmentSource, `Scene ${scene} alignment source differs`);
    invariant(/^[A-Za-z0-9_-]{8,128}$/u.test(item.voiceId ?? ""), `Scene ${scene} voice ID is invalid`);

    const alignmentPath = join(projectDir, "assets", "audio", "voice", item.alignment);
    const alignmentSourceText = await readFile(alignmentPath, "utf8");
    invariant(alignmentHashes[String(scene)] === sha256(alignmentSourceText), `Scene ${scene} alignment hash differs`);
    const record = JSON.parse(alignmentSourceText);
    invariant(record.text === item.text, `Scene ${scene} alignment text differs`);
    invariant(record.originalAlignment === null, `Scene ${scene} incorrectly stores provider-native timing`);
    invariant(record.metadata?.source === expected.changedAlignmentSource, `Scene ${scene} alignment metadata source differs`);
    invariant(record.metadata?.providerAlignmentAvailable === false, `Scene ${scene} alignment metadata claims provider timing`);
    invariant(record.metadata?.qualityGate === "passed", `Scene ${scene} alignment quality gate did not pass`);
    invariant(record.metadata?.audioSha256 === item.sha256, `Scene ${scene} alignment/audio hash differs`);
    invariant(record.metadata?.audioBytes === item.bytes, `Scene ${scene} alignment/audio byte count differs`);
    invariant(record.metadata?.scriptSha256 === manifest.scriptSha256, `Scene ${scene} alignment script hash differs`);
    const [proofAudio, proofAlignment] = await Promise.all([
      readFile(join(proofVoiceDir, item.audio)),
      readFile(join(proofVoiceDir, item.alignment)),
    ]);
    invariant(sha256(proofAudio) === item.sha256, `Proof scene ${scene} audio hash differs`);
    invariant(sha256(proofAlignment) === alignmentHashes[String(scene)], `Proof scene ${scene} alignment hash differs`);
  }

  const voiceIdsByScene = manifest.voiceIdsByScene;
  invariant(voiceIdsByScene && typeof voiceIdsByScene === "object" && !Array.isArray(voiceIdsByScene), "Voice ID scene map is missing");
  const mappedVoiceIds = new Map();
  for (const [voiceId, scenes] of Object.entries(voiceIdsByScene)) {
    invariant(/^[A-Za-z0-9_-]{8,128}$/u.test(voiceId), "Voice ID scene map contains an invalid voice ID");
    invariant(Array.isArray(scenes), `Voice ID ${voiceId} has no scene list`);
    for (const scene of scenes) {
      invariant(Number.isInteger(scene) && scene >= 1 && scene <= 9, `Voice ID ${voiceId} contains an invalid scene`);
      invariant(!mappedVoiceIds.has(scene), `Voice scene ${scene} is assigned more than once`);
      mappedVoiceIds.set(scene, voiceId);
    }
  }
  invariant(mappedVoiceIds.size === 9, "Voice ID scene map does not cover all nine scenes");
  for (const scene of expected.retainedVoiceScenes) {
    invariant(mappedVoiceIds.get(scene) === retained.voiceId, `Retained scene ${scene} voice ID differs`);
  }
  for (const scene of expected.changedVoiceScenes) {
    invariant(mappedVoiceIds.get(scene) === manifest.scenes[scene - 1].voiceId, `Route-generated scene ${scene} voice ID differs`);
  }
  const uniqueVoiceIds = new Set(mappedVoiceIds.values());
  invariant(
    manifest.voiceId === (uniqueVoiceIds.size === 1 ? [...uniqueVoiceIds][0] : "mixed"),
    "Top-level voice ID does not match its per-scene map",
  );
  if (manifest.status === "approved-final-capture-sync") {
    invariant(
      /Captions, timing, proof assets, and manifests are synchronized\./u.test(manifest.purpose ?? ""),
      "Approved voice manifest still carries a pre-caption purpose",
    );
    const proofFinalManifest = JSON.parse(await readFile(join(proofVoiceDir, "manifest.json"), "utf8"));
    invariant(JSON.stringify(proofFinalManifest) === JSON.stringify(manifest), "Final proof voice manifest differs from the local manifest");
  }
}

async function fileState(relative) {
  try {
    const path = join(projectDir, ...relative.split("/"));
    const info = await stat(path);
    return { exists: true, path, bytes: info.size };
  } catch {
    return { exists: false, path: join(projectDir, ...relative.split("/")), bytes: 0 };
  }
}

function probePng(buffer) {
  invariant(buffer.length >= 24 && buffer.subarray(1, 4).toString("ascii") === "PNG", "Capture is not a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function parseRate(value) {
  const [numerator, denominator = "1"] = String(value).split("/").map(Number);
  return denominator ? numerator / denominator : 0;
}

function probeVideo(path) {
  const result = JSON.parse(execFileSync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,avg_frame_rate",
    "-show_entries", "format=duration",
    "-of", "json",
    path,
  ], { encoding: "utf8" }));
  const stream = result.streams?.[0];
  return {
    width: Number(stream?.width),
    height: Number(stream?.height),
    fps: parseRate(stream?.avg_frame_rate),
    duration: Number(result.format?.duration),
  };
}

const packageJson = await readJson("package.json");
const proof = await readJson("data", "release-proof.json");
const voiceManifest = await readJson("data", "voiceover-manifest.json");
const captionJsonSource = await readFile(join(projectDir, "data", "caption-cues.json"), "utf8");
const captionData = JSON.parse(captionJsonSource);
const audioManifest = await readJson("data", "audio-manifest.json");
const captureContracts = await readJson("data", "capture-contracts.json");
const captureLock = await readJson("data", "capture-lock.json");
const motionSidecar = await readJson("index.motion.json");
const index = await readFile(join(projectDir, "index.html"), "utf8");
const script = await readFile(join(projectDir, "SCRIPT.md"), "utf8");
const srt = await readFile(join(projectDir, "CAPTIONS.srt"), "utf8");
const vtt = await readFile(join(projectDir, "CAPTIONS.vtt"), "utf8");
const scriptLines = [...script.matchAll(/^ {4}(.+)$/gm)].map((match) => match[1].trim());
invariant(scriptLines.length === 9, "SCRIPT.md must contain exactly nine narration lines");
const narrationGenerationEvidence = await validateNarrationGenerationLedger(scriptLines);

const allFrameFiles = [
  "01-outcome-lockup.html",
  "02-architecture-rail.html",
  "03-complex-product-flow.html",
  "04-net-freeze-bind.html",
  "05-dual-consent-simulate.html",
  "06-keeperhub-proof.html",
  "07-nine-mcp-tools.html",
  "08-mcp-climax.html",
  "09-proof-cta.html",
];
const frameSources = new Map(await Promise.all(allFrameFiles.map(async (file) => [
  file,
  await readFile(join(projectDir, "compositions", "frames", file), "utf8"),
])));
const slotFiles = [
  "C03-complex-product-flow.svg",
  "C04-net-freeze-bind.svg",
  "C05-dual-consent-simulate.svg",
  "C06-keeperhub-proof.svg",
  "C07-developer-mcp-surface.svg",
  "C08-mcp-nonbroadcast-status.svg",
];
const slotSources = await Promise.all(slotFiles.map((file) => readFile(join(projectDir, "assets", "capture-slots", file), "utf8")));

invariant(index.includes(`data-duration="${expected.duration}"`), "Root duration is not 96 seconds");
invariant(index.includes(`<meta name="viewport" content="width=${expected.width}, height=${expected.height}"/>`), "Viewport is not native 4K");
invariant(index.includes(`data-width="${expected.width}" data-height="${expected.height}" data-fps="${expected.fps}"`), "Root composition is not 3840x2160 at 60 fps");
const nativeDimensions = `data-width="${expected.width}" data-height="${expected.height}"`;
invariant(index.split(nativeDimensions).length - 1 === 10, "The root plus all nine frame hosts must declare native 4K dimensions");
for (const [file, source] of frameSources) {
  invariant(source.includes(nativeDimensions), `${file} is not a native 4K sub-composition`);
  invariant(source.includes("#root{position:absolute;inset:0;width:3840px;height:2160px"), `${file} root CSS is not native 4K`);
  invariant(source.includes(".scene{width:50%;height:50%;transform:scale(2);transform-origin:0 0"), `${file} is missing the deterministic native-4K scene transform`);
}
for (const [indexValue, source] of slotSources.entries()) {
  invariant(source.includes('width="3200" height="1520"'), `${slotFiles[indexValue]} is not a 2x vector capture contract`);
}

const packageText = JSON.stringify(packageJson);
invariant(!packageText.includes("0.7.105") && packageText.includes("hyperframes@0.7.106"), "HyperFrames scripts are not fully pinned to 0.7.106");
const finalRenderCommand = packageJson.scripts?.["render:final"] ?? "";
for (const token of ["--fps 60", "--resolution landscape-4k", "--video-frame-format png", "--strict-all", "--no-best-effort", "--low-memory-mode"]) {
  invariant(finalRenderCommand.includes(token), `Final render command is missing ${token}`);
}
invariant(index.includes('id="caption-layer"') && index.includes("data-layout-allow-caption-zone"), "Caption zone waiver is missing");
const frameTwo = frameSources.get("02-architecture-rail.html");
for (const token of ['id="f02-world" class="world" data-layout-allow-overflow', 'id="f02-heading" class="heading" data-layout-allow-occlusion', 'class="counter" data-layout-allow-occlusion', 'id="f02-station-2" class="station s2" data-layout-allow-occlusion', 'id="f02-station-4" class="station s4" data-layout-allow-occlusion']) {
  invariant(frameTwo.includes(token), `Frame 2 is missing narrow layout annotation: ${token}`);
}
invariant(frameSources.get("08-mcp-climax.html").includes('<aside class="rail" data-layout-allow-occlusion>'), "Frame 8 rail occlusion annotation is missing");
invariant(Array.isArray(motionSidecar.assertions) && motionSidecar.assertions.length === 27, "Root motion sidecar must contain 27 targeted assertions");

const frameSeven = frameSources.get("07-nine-mcp-tools.html");
const displayedTools = [...frameSeven.matchAll(/<code>([^<]+)<\/code>/gu)].map((match) => match[1]);
invariant(JSON.stringify(displayedTools) === JSON.stringify(expected.productionTools), "Frame 7 must display exactly the nine production MCP tools in canonical order");
invariant(proof.currentSource?.productionMcpTools === expected.productionTools.length, "Release proof does not declare exactly nine production MCP tools");
invariant(proof.currentSource?.retiredFixedWalletTools === 0, "Release proof still declares a retired fixed-wallet tool");
invariant(proof.currentSource?.walletModel === "external debtor wallets", "Release proof wallet model is not external-debtor-wallet signing");
invariant(proof.currentSource?.firstPartyFreezeReviewStages === 4, "Release proof does not declare the four-stage Freeze review");

const frameFour = frameSources.get("04-net-freeze-bind.html");
for (const phrase of ["ATTESTED AGENT REVIEW", "EXTRACTION", "ALLOCATION", "CONSENT", "PROOF PREFLIGHT", "SKIPPED BEFORE SUBMISSION", "REVIEW INVALIDATED", "FRESH ATTESTED RUN REQUIRED"]) {
  invariant(frameFour.includes(phrase), `Frame 4 is missing the attested-review contract: ${phrase}`);
}

const frameEight = frameSources.get("08-mcp-climax.html");
for (const phrase of [
  "initialize + tools/list",
  "allocate_receipt",
  "prepare_receipt_settlement",
  "broadcast approval boundary",
  "HARD STOP",
  "no wallet action · no submission",
  "retained settlement status",
  "NO WALLET SIGNATURE · NO SUBMIT · NO SECOND VALUE MOVE",
  "RETAINED RUN · NOT THIS MCP SUBMISSION",
]) {
  invariant(frameEight.includes(phrase), `Frame 8 is missing the non-broadcast truth contract: ${phrase}`);
}
for (const phrase of ["submit_signed_settlement", "personal-sign", "MCP SAME-RUN", "same-run"]) {
  invariant(!frameEight.toLowerCase().includes(phrase.toLowerCase()), `Frame 8 contains forbidden broadcast chronology: ${phrase}`);
}

const narrativeFiles = [
  "BRIEF.md",
  "SCRIPT.md",
  "STORYBOARD.md",
  "CAPTURE_MANIFEST.md",
  "COMPOSITION_PLAN.md",
  "EVIDENCE_MAP.md",
  "VIDEO_HANDOFF.md",
  "CAPTIONS.srt",
  "CAPTIONS.vtt",
];
const narrativeSource = (await Promise.all(narrativeFiles.map((file) => readFile(join(projectDir, file), "utf8")))).join("\n");
for (const phrase of ["Supademo", "Invite the table", "final human signature", "then submits", "personal-sign", "G-MCP-V2-SAME-RUN", "same-run"]) {
  invariant(!narrativeSource.toLowerCase().includes(phrase.toLowerCase()), `Narrative source contains retired or unsupported framing: ${phrase}`);
}

const visualSource = [index, ...frameSources.values(), ...slotSources].join("\n");
const retiredPrefix = "demo" + "_";
const retiredRoute = "/" + "lab";
const fixedIdentities = [
  String.fromCharCode(86, 101, 101),
  String.fromCharCode(72, 101, 109),
  String.fromCharCode(82, 97, 118, 105),
];
const fixedIdentityPattern = new RegExp(`\\b(?:${fixedIdentities.join("|")})\\b`, "iu");
invariant(!visualSource.toLowerCase().includes(retiredPrefix), "Visual source names a retired MCP tool");
invariant(!visualSource.toLowerCase().includes(retiredRoute), "Visual source links to the retired product route");
invariant(!fixedIdentityPattern.test(visualSource), "Visual source contains a fixed participant identity");

invariant(proof.chainId === expected.chainId, "Release proof chain is not Base Sepolia 84532");
for (const field of ["executionId", "transactionHash", "blockNumber", "settlementId", "ledgerHash", "amountAtomic"]) {
  invariant(proof.settlement[field] === expected[field], `Release proof mismatch: settlement.${field}`);
}
invariant(proof.settlement.pullCount === 1 && proof.settlement.payoutCount === 1, "Release proof is not the exact one-pull / one-payout run");
invariant(proof.settlement.verdict === "VERIFIED_SETTLED" && proof.settlement.independentRpcEventMatch === true, "Release proof is not independently verified");
invariant(proof.settlement.executionId !== proof.deployment.executionId, "Settlement execution reuses deployment execution");
invariant(proof.settlement.transactionHash !== proof.deployment.transactionHash, "Settlement transaction reuses deployment transaction");
const truth = proof.truthBoundary ?? {};
invariant(truth.settlementProofVerified === true, "Retained settlement proof is not verified");
invariant(truth.mcpBroadcastClaimed === false, "Release proof incorrectly claims an MCP broadcast");
invariant(/not an MCP submission/iu.test(truth.retainedRunOrigin ?? ""), "Retained run origin is not explicitly separated from MCP");

invariant(Array.isArray(voiceManifest.scenes) && voiceManifest.scenes.length === 9, "Voiceover manifest must contain nine scenes");
const pendingVoiceScenes = Array.isArray(voiceManifest.changedScenesPendingRegeneration)
  ? voiceManifest.changedScenesPendingRegeneration
  : [];
const voiceAssetIssues = [];
const voiceScriptMismatches = [];
for (let scene = 1; scene <= 9; scene += 1) {
  const item = voiceManifest.scenes[scene - 1];
  const path = join(projectDir, "assets", "audio", "voice", item.audio);
  try {
    const bytes = await readFile(path);
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) {
      voiceAssetIssues.push(`scene ${scene} hash/byte mismatch`);
    }
  } catch {
    voiceAssetIssues.push(`scene ${scene} missing audio`);
  }
  if (item.text !== scriptLines[scene - 1]) {
    voiceScriptMismatches.push(scene);
    invariant(pendingVoiceScenes.includes(scene), `Unexpected script/audio mismatch in scene ${scene}`);
  }
  const expectedTag = `id="voice-${String(scene).padStart(2, "0")}"`;
  invariant(index.includes(expectedTag), `index.html is missing voice clip ${scene}`);
  const nearby = index.slice(index.indexOf(expectedTag), index.indexOf(expectedTag) + 360);
  invariant(nearby.includes(`data-start="${[0.65, 6.2, 16.4, 31.4, 44.2, 56.35, 66.25, 73.15, 91.05][scene - 1]}"`), `Voice clip ${scene} start is not synchronized`);
  invariant(nearby.includes(`data-duration="${Number(item.durationSeconds).toFixed(3)}"`), `Voice clip ${scene} duration is not synchronized`);
}
invariant(voiceAssetIssues.length === 0, `Voice asset integrity failed: ${voiceAssetIssues.join(", ")}`);
const hybridNarrationProvenanceApproved = pendingVoiceScenes.length === 0;
if (hybridNarrationProvenanceApproved) {
  await validateHybridNarrationProvenance(voiceManifest, narrationGenerationEvidence);
}
const finalNarrationApproved = voiceManifest.status === "approved-final-capture-sync"
  && voiceManifest.regenerateAfterApprovedCaptures === false
  && voiceManifest.captionSyncRequired === false
  && voiceManifest.captureLockAcknowledged === true
  && hybridNarrationProvenanceApproved
  && pendingVoiceScenes.length === 0
  && voiceScriptMismatches.length === 0;
if (finalNarrationApproved) {
  invariant(voiceManifest.scriptSha256 === sha256(canonicalSource(script)), "Approved voice manifest script hash is stale");
  for (const scene of voiceManifest.scenes) {
    const alignmentPath = join(projectDir, "assets", "audio", "voice", scene.alignment);
    const record = JSON.parse(await readFile(alignmentPath, "utf8"));
    invariant(record.text === scene.text, `Approved alignment text mismatch in scene ${scene.scene}`);
  }
}

invariant(captionData.durationSeconds === expected.duration && captionData.maxLineLength === 42, "Caption data contract is invalid");
invariant(Array.isArray(captionData.cues) && captionData.cues.length > 0, "Caption cue data is empty");
invariant(vtt.startsWith("WEBVTT\n\n"), "CAPTIONS.vtt is not valid WebVTT");
for (const [indexValue, cue] of captionData.cues.entries()) {
  invariant(cue.end > cue.start, `Caption cue ${indexValue + 1} has a non-positive duration`);
  invariant(cue.lines.length <= 2 && cue.lines.every((line) => line.length <= 42), `Caption cue ${indexValue + 1} exceeds the line contract`);
  const id = String(indexValue + 1).padStart(2, "0");
  const markup = `id="cap-${id}" class="caption-cue">${cue.lines.map(html).join("<br/>")}</p>`;
  invariant(index.includes(markup), `Baked caption ${id} does not match cue JSON`);
  invariant(srt.includes(cue.lines.join("\n")) && vtt.includes(cue.lines.join("\n")), `Subtitle files do not contain cue ${id}`);
}
for (let scene = 1; scene <= 9; scene += 1) {
  const joined = captionData.cues
    .filter((cue) => Number(cue.scene) === scene)
    .map((cue) => cue.lines.join(" "))
    .join(" ");
  invariant(canonicalText(joined) === canonicalText(scriptLines[scene - 1]), `Caption text does not reproduce SCRIPT.md scene ${scene}`);
}
const finalCaptionsApproved = captionData.status === "approved-final-capture-sync"
  && finalNarrationApproved
  && voiceManifest.captionAssets
  && voiceManifest.captionAssets.cueJsonSha256 === sha256(captionJsonSource)
  && voiceManifest.captionAssets.srtSha256 === sha256(srt)
  && voiceManifest.captionAssets.vttSha256 === sha256(vtt)
  && voiceManifest.captionAssets.bakedIndexSha256 === sha256(index);

invariant(audioManifest.status === "source-locked", "Audio source manifest is not locked");
invariant(audioManifest.bgm === null, "A BGM asset is present without an approved source contract");
invariant(audioManifest.sfxLicense?.name === "Pixabay Content License", "SFX license is not documented");
for (const file of audioManifest.files ?? []) {
  const bytes = await readFile(join(projectDir, ...file.path.split("/")));
  invariant(bytes.length === file.bytes && sha256(bytes) === file.sha256, `SFX asset hash mismatch: ${file.path}`);
}
for (const cue of audioManifest.cues ?? []) {
  const id = `id="sfx-${cue.id}"`;
  invariant(index.includes(id), `SFX cue is missing from index.html: ${cue.id}`);
  const nearby = index.slice(index.indexOf(id), index.indexOf(id) + 360);
  invariant(nearby.includes(`src="assets/audio/sfx/${cue.file}"`), `SFX cue path mismatch: ${cue.id}`);
  invariant(nearby.includes(`data-start="${cue.start}"`) && nearby.includes(`data-duration="${cue.duration}"`) && nearby.includes(`data-volume="${cue.volume}"`) && nearby.includes(`data-track-index="${cue.trackIndex}"`), `SFX cue timing/volume/track mismatch: ${cue.id}`);
}

invariant(captureContracts.status === "locked-truth-contracts", "Capture truth contracts are not locked");
invariant(Array.isArray(captureContracts.captures) && captureContracts.captures.length === 8, "Expected eight canonical capture artifacts");
const missingCaptures = [];
for (const capture of captureContracts.captures) {
  const state = await fileState(capture.path);
  if (!state.exists || state.bytes === 0) missingCaptures.push(capture.path);
}

const slotReferences = [];
for (const [file, source] of frameSources) {
  if (/CAPTURE SLOT|CAPTURE CONTRACT|capture-slots\/|READ-ONLY CAPTURE/iu.test(source)) slotReferences.push(file);
}

const unresolvedTruth = [
  ["productCaptureComplete", truth.productCaptureComplete],
  ["liveMcpToolListCaptureComplete", truth.liveMcpToolListCaptureComplete],
  ["mcpNonBroadcastCaptureComplete", truth.mcpNonBroadcastCaptureComplete],
  ["retainedRunReadOnlyStatusCaptureComplete", truth.retainedRunReadOnlyStatusCaptureComplete],
].filter(([, value]) => value !== true).map(([key]) => key);

const captureLockApproved = captureLock.status === "approved-canonical-captures"
  && typeof captureLock.approvedAt === "string"
  && Array.isArray(captureLock.captures)
  && captureLock.captures.length === captureContracts.captures.length;

if (!allowPlaceholders) {
  invariant(missingCaptures.length === 0, `Final render blocked: missing captures: ${missingCaptures.join(", ")}`);
  invariant(slotReferences.length === 0, `Final render blocked: placeholder source remains in: ${slotReferences.join(", ")}`);
  invariant(unresolvedTruth.length === 0, `Final render blocked: unresolved truth gates: ${unresolvedTruth.join(", ")}`);
  invariant(captureLockApproved, "Final render blocked: canonical capture hash lock is not approved");
  const lockById = new Map(captureLock.captures.map((item) => [item.id, item]));
  for (const capture of captureContracts.captures) {
    const lock = lockById.get(capture.id);
    invariant(lock?.path === capture.path, `Capture lock path mismatch: ${capture.id}`);
    const bytes = await readFile(join(projectDir, ...capture.path.split("/")));
    invariant(lock.bytes === bytes.length && lock.sha256 === sha256(bytes), `Capture lock hash mismatch: ${capture.id}`);
    if (capture.kind === "still") {
      const dimensions = probePng(bytes);
      invariant(dimensions.width >= captureContracts.global.minimumStill.width && dimensions.height >= captureContracts.global.minimumStill.height, `Capture resolution too small: ${capture.id}`);
    } else {
      const probe = probeVideo(join(projectDir, ...capture.path.split("/")));
      invariant(probe.width >= captureContracts.global.minimumVideo.width && probe.height >= captureContracts.global.minimumVideo.height, `Capture resolution too small: ${capture.id}`);
      invariant(probe.fps >= captureContracts.global.minimumVideo.fps, `Capture frame rate too low: ${capture.id}`);
      invariant(probe.duration >= capture.minimumDurationSeconds, `Capture duration too short: ${capture.id}`);
    }
  }
  invariant(finalNarrationApproved, "Final render blocked: route-generated narration is not provenance-verified and synchronized");
  invariant(finalCaptionsApproved, "Final render blocked: SRT, VTT, cue JSON, baked captions, and asset hashes are not synchronized");
  process.stdout.write("FINAL RENDER GATE PASSED\n");
} else {
  const pendingParts = [
    missingCaptures.length > 0 ? `${missingCaptures.length} capture files` : null,
    slotReferences.length > 0 ? `${slotReferences.length} slot-bearing frames` : null,
    unresolvedTruth.length > 0 ? `${unresolvedTruth.length} truth flags` : null,
    captureLockApproved ? null : "capture hash lock",
    finalNarrationApproved ? null : `narration scenes ${pendingVoiceScenes.join(",") || "approval"}`,
    finalCaptionsApproved ? null : "caption approval/hash sync",
  ].filter(Boolean);
  process.stdout.write(pendingParts.length > 0
    ? `SOURCE GATE PASSED · final render intentionally blocked by ${pendingParts.join(", ")}\n`
    : "SOURCE GATE PASSED · final render prerequisites synchronized\n");
}
