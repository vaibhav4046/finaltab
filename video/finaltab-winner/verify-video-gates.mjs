import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveMediaTools } from "./scripts/resolve-media-tools.mjs";
import {
  ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER,
  countElevenLabsNarrationCharacters,
} from "./scripts/elevenlabs-quota-guard.mjs";

const projectDir = dirname(fileURLToPath(import.meta.url));
const allowPlaceholders = process.argv.includes("--allow-placeholders");
const renderedIndex = process.argv.indexOf("--rendered");
const renderedPath = renderedIndex >= 0 ? resolve(projectDir, process.argv[renderedIndex + 1] ?? "") : null;
const renderedTranscriptIndex = process.argv.indexOf("--rendered-transcript");
const renderedTranscriptPath = renderedTranscriptIndex >= 0 ? resolve(projectDir, process.argv[renderedTranscriptIndex + 1] ?? "") : null;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
function readText(relativePath) {
  return readFileSync(join(projectDir, ...relativePath.split("/")), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha(relativePath) {
  return sha256(readFileSync(join(projectDir, ...relativePath.split("/"))));
}

function words(value) {
  return value.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) ?? [];
}

function normalizedWords(value) {
  return words(value).map((word) => word.replaceAll("’", "'").toLocaleLowerCase("en-US"));
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function transcriptWords(payload) {
  const candidates = Array.isArray(payload)
    ? payload
    : payload?.words ?? payload?.transcript ?? payload?.scenes?.flatMap((scene) => scene.words ?? []);
  invariant(Array.isArray(candidates), "Transcript gate requires a word array or an object with a words array");
  return candidates.map((item, indexValue) => {
    invariant(item && typeof item === "object", `Transcript word ${indexValue + 1} is not an object`);
    const text = String(item.text ?? item.word ?? "").trim();
    const start = Number(item.start ?? item.start_time);
    const end = Number(item.end ?? item.end_time);
    invariant(text && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start, `Transcript word ${indexValue + 1} has invalid text/timing`);
    return { text, start, end };
  });
}

function scriptLines(source) {
  return [...source.matchAll(/^ {4}(.+)$/gmu)].map((match) => match[1].trim()).filter(Boolean);
}

function field(block, name) {
  return block.match(new RegExp(`^- ${name}: (.+)$`, "mu"))?.[1]?.trim() ?? null;
}

function storyboardScenes(source) {
  const headings = [...source.matchAll(/^## Scene (\d+) — (.+)$/gmu)];
  return headings.map((heading, index) => ({
    scene: Number(heading[1]),
    title: heading[2].trim(),
    block: source.slice(heading.index, headings[index + 1]?.index ?? source.length),
  }));
}

function pngDimensions(relativePath) {
  const bytes = readFileSync(join(projectDir, ...relativePath.split("/")));
  invariant(bytes.length >= 24 && bytes.subarray(1, 4).toString("ascii") === "PNG", `${relativePath} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  invariant(!result.error, `${label} could not start: ${result.error?.message ?? "unknown error"}`);
  invariant(result.status === 0, `${label} failed: ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}

function probeVideo(path) {
  const { ffprobe } = resolveMediaTools();
  const probe = run(ffprobe.path, [
    "-v", "error", "-count_frames",
    "-show_entries", "format=duration,format_name:stream=index,codec_type,codec_name,pix_fmt,width,height,r_frame_rate,nb_frames,nb_read_frames,duration,sample_rate,channels",
    "-of", "json",
    path,
  ], `ffprobe ${path}`);
  const payload = JSON.parse(probe.stdout);
  const video = payload.streams?.find((stream) => stream.codec_type === "video");
  const audio = payload.streams?.find((stream) => stream.codec_type === "audio");
  invariant(video, `${path} has no video stream`);
  const [num, den] = String(video.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    formatName: String(payload.format?.format_name ?? ""),
    videoCodec: String(video.codec_name ?? ""),
    pixelFormat: String(video.pix_fmt ?? ""),
    width: Number(video.width),
    height: Number(video.height),
    fps: den ? num / den : 0,
    duration: Number(payload.format?.duration),
    videoDuration: Number(video.duration),
    frameCount: Number(video.nb_read_frames ?? video.nb_frames),
    audioCodec: String(audio?.codec_name ?? ""),
    audioSampleRate: Number(audio?.sample_rate),
    audioChannels: Number(audio?.channels),
    audioDuration: Number(audio?.duration),
    streamCount: payload.streams?.length ?? 0,
    hasAudio: Boolean(audio),
  };
}

function measureLoudness(path) {
  const sink = process.platform === "win32" ? "NUL" : "/dev/null";
  const { ffmpeg } = resolveMediaTools();
  const result = spawnSync(ffmpeg.path, [
    "-hide_banner", "-nostats", "-i", path,
    "-af", "loudnorm=I=-14:LRA=7:TP=-1:print_format=json",
    "-f", "null", sink,
  ], { encoding: "utf8", windowsHide: true });
  invariant(!result.error, `ffmpeg loudness measurement could not start: ${result.error?.message ?? "unknown error"}`);
  const matches = [...String(result.stderr).matchAll(/\{\s*"input_i"[\s\S]*?\}/gu)];
  invariant(matches.length > 0, "ffmpeg did not return loudness JSON");
  return JSON.parse(matches.at(-1)[0]);
}

const contract = readJson("data/v3-source-contract.json");
const captureContracts = readJson("data/capture-contracts.json");
const captureLock = readJson("data/capture-lock.json");
const voice = readJson("data/voiceover-manifest.json");
const ledger = readJson("data/narration-generation-ledger.json");
const captions = readJson("data/caption-cues.json");
const audio = readJson("data/audio-manifest.json");
const superseded = readJson("data/superseded-v2-assets.json");
const releaseProof = readJson("data/release-proof.json");
const meta = readJson("meta.json");
const packageJson = readJson("package.json");
const script = readText("SCRIPT.md");
const storyboard = readText("STORYBOARD.md");
const frameSpec = readText("frame.md");
const design = readText("DESIGN.md");
const index = readText("index.html");
const motion = readJson("index.motion.json");

invariant(contract.schemaVersion === 3 && contract.status === "source-locked-v3-prerequisites-pending", "V3 source contract is not locked");
invariant(contract.durationSeconds === 90 && contract.frameCount === 5400, "V3 duration/frame count differs");
invariant(contract.width === 3840 && contract.height === 2160 && contract.fps === 60, "V3 delivery target differs");
invariant(Array.isArray(contract.scenes) && contract.scenes.length === 8, "V3 must contain exactly eight scenes");

let cursor = 0;
for (const [indexValue, scene] of contract.scenes.entries()) {
  invariant(scene.scene === indexValue + 1, `Scene order differs at ${indexValue + 1}`);
  invariant(scene.start === cursor, `Scene ${scene.scene} does not start at ${cursor}`);
  invariant(scene.end === scene.start + scene.duration, `Scene ${scene.scene} end differs`);
  invariant(scene.duration > 0, `Scene ${scene.scene} duration is invalid`);
  cursor = scene.end;
}
invariant(cursor === 90, "Scene schedule does not end at 90.000 seconds");

const lockedLines = scriptLines(script);
invariant(lockedLines.length === 8, "SCRIPT.md must contain exactly eight indented narration lines");
invariant(lockedLines.every((line, indexValue) => line === contract.scenes[indexValue].narration), "SCRIPT.md narration differs from the V3 contract");
const spokenWords = words(lockedLines.join(" "));
invariant(spokenWords.length === 188 && contract.wordCount === 188, "Narration must remain exactly 188 words");
for (const forbidden of contract.spokenTermRules.forbidden) {
  invariant(!lockedLines.join(" ").toLocaleLowerCase().includes(forbidden.toLocaleLowerCase()), `Narration contains forbidden unexplained term: ${forbidden}`);
}
for (const translated of contract.spokenTermRules.requiredTranslations) {
  invariant(lockedLines.join(" ").includes(translated), `Narration is missing immediate translation: ${translated}`);
}

const storyScenes = storyboardScenes(storyboard);
invariant(storyScenes.length === 8, "STORYBOARD.md must contain exactly eight scenes");
for (const [indexValue, storyScene] of storyScenes.entries()) {
  const expected = contract.scenes[indexValue];
  invariant(storyScene.scene === expected.scene, `Storyboard scene ${expected.scene} order differs`);
  invariant(field(storyScene.block, "duration") === `${expected.duration}s`, `Storyboard scene ${expected.scene} duration differs`);
  invariant(field(storyScene.block, "src") === expected.src, `Storyboard scene ${expected.scene} source differs`);
  const guide = field(storyScene.block, "voiceover");
  invariant(guide === `"${expected.narration}"`, `Storyboard scene ${expected.scene} voiceover differs`);
}
invariant(/^duration: 90s$/mu.test(storyboard), "Storyboard frontmatter is not 90s");

for (const [label, source] of [["frame.md", frameSpec], ["DESIGN.md", design]]) {
  invariant(!/Fraunces/iu.test(source), `${label} still contains the removed serif identity`);
  invariant(/Geist Sans/iu.test(source) && /Geist Mono/iu.test(source), `${label} does not lock Geist Sans and Geist Mono`);
}
invariant(frameSpec.includes("duration_seconds: 90"), "frame.md does not lock 90 seconds");
invariant(meta.sourceRevision === "v3-90s-eight-scene", "meta.json revision differs");
invariant(meta.deliveryTarget?.durationSeconds === 90 && meta.deliveryTarget?.framesAt90Seconds === 5400, "meta.json delivery timing differs");
invariant(meta.deliveryTarget?.integratedLufs === -14 && meta.deliveryTarget?.maxTruePeakDbtp === -1, "meta.json mastering target differs");

invariant(index.includes('data-build-revision="v3-90s-eight-scene"'), "index.html revision marker differs");
invariant(index.includes('data-duration="90"'), "index.html root is not 90 seconds");
const captionBlock = index.match(/<!-- V3_CAPTIONS_START -->([\s\S]*?)<!-- V3_CAPTIONS_END -->/u)?.[1] ?? null;
invariant(captionBlock !== null, "index.html caption markers are missing");
invariant(!/<br\b|translateX\s*\(/iu.test(captionBlock), "V3 captions must not use <br> or translateX centering");
const narrationMasterCount = (index.match(/id=["']v3-narration-master["']/gu) ?? []).length;
invariant(narrationMasterCount <= 1, "index.html contains more than one narration master");
const activeHosts = [...index.matchAll(/data-composition-src="(compositions\/frames-v3\/[^"]+)"/gu)].map((match) => match[1]);
invariant(JSON.stringify(activeHosts) === JSON.stringify(contract.scenes.map((scene) => scene.src)), "index.html does not contain the exact eight V3 hosts");
invariant(!/voice-09|scene-09|eleven_flash_v2_5|retained-multilingual-v2/iu.test(index), "index.html still references rejected narration");
invariant(motion.revision === "v3-90s-eight-scene" && motion.duration === 90, "Motion sidecar is not V3/90s");

invariant(captureContracts.schemaVersion === 3 && captureContracts.status === "locked-v3-truth-contracts", "V3 capture contracts are not locked");
invariant(JSON.stringify(captureContracts.captures.map((item) => item.id)) === JSON.stringify(contract.requiredCaptureIds), "Capture IDs differ from the V3 contract");
invariant(JSON.stringify(captureContracts.captures.map((item) => item.path)) === JSON.stringify([
  "assets/capture-v3/C05-final-site-demo.mp4",
  "assets/capture-v3/C06-complex-agent-task.mp4",
  "assets/capture-v3/C07-mcp-nonbroadcast.mp4",
  "assets/capture-v3/C08-retained-proof.png",
]), "Capture paths differ from the V3 contract");
invariant(["pending-v3-captures", "approved-v3-captures"].includes(captureLock.status), "Capture lock has an invalid V3 state");

invariant(voice.schemaVersion === 3, "Voice manifest schema differs");
invariant(voice.provider === contract.narration.provider && voice.model === contract.narration.model, "Voice provider/model differs");
invariant(voice.voiceId === contract.narration.voiceId && voice.voiceName === contract.narration.voiceName, "Voice identity differs");
invariant(voice.expectedProviderCalls === 1 && voice.reuseAllowed === false && voice.reusedAssets.length === 0, "Voice manifest does not enforce one all-new batch");
invariant(Array.isArray(voice.scenes) && voice.scenes.length === 8, "Voice manifest must contain eight scene guides");
invariant(voice.scenes.every((scene, indexValue) => scene.text === lockedLines[indexValue]), "Voice manifest text differs from SCRIPT.md");
invariant(voice.master?.path === contract.narration.masterPath && voice.master?.alignmentPath === contract.narration.alignmentPath, "Voice master paths differ");

invariant(ledger.schemaVersion === 3 && ledger.provider === "ElevenLabs" && ledger.model === "eleven_multilingual_v2", "Narration ledger provider/model differs");
invariant(ledger.sanitized === true && ledger.containsCredentials === false, "Narration ledger must remain sanitized and credential-free");
invariant(ledger.voiceId === contract.narration.voiceId && ledger.scriptWordCount === contract.wordCount, "Narration ledger voice/script scope differs");
invariant(ledger.callSummary?.expectedProviderCalls === 1 && ledger.callSummary?.reusedSceneCalls === 0, "Narration ledger does not enforce one new batch");

invariant(captions.schemaVersion === 3 && captions.durationSeconds === 90 && captions.maxLineLength === 42, "Caption contract differs");
invariant(captions.scriptWordCount === 188, "Caption contract must require exactly 188 words");
invariant(audio.schemaVersion === 3 && audio.durationSeconds === 90 && audio.bgm === null, "Audio manifest duration/BGM differs");
invariant(audio.mastering?.integratedLufs === -14 && audio.mastering?.maxTruePeakDbtp === -1, "Audio mastering target differs");
invariant(audio.cues.filter((cue) => cue.id.startsWith("handoff-")).length === 7, "Audio manifest must contain seven scene handoffs");
for (const file of audio.files) {
  invariant(existsSync(join(projectDir, ...file.path.split("/"))), `Licensed SFX is missing: ${file.path}`);
  invariant(statSync(join(projectDir, ...file.path.split("/"))).size === file.bytes, `Licensed SFX byte count differs: ${file.path}`);
  invariant(fileSha(file.path) === file.sha256, `Licensed SFX hash differs: ${file.path}`);
}
for (const cue of audio.cues) {
  const cueId = `sfx-${cue.id}`;
  const cueTags = index.match(new RegExp(`<audio[^>]+id=["']${cueId}["'][^>]*>`, "gu")) ?? [];
  invariant(cueTags.length === 1, `Audio cue ${cue.id} must be mounted exactly once`);
  const tag = cueTags[0];
  invariant(tag.includes(`src="assets/audio/sfx/${cue.file}"`), `Audio cue ${cue.id} source differs`);
  invariant(tag.includes(`data-start="${cue.start}"`) && tag.includes(`data-duration="${cue.duration}"`), `Audio cue ${cue.id} timing differs`);
  invariant(tag.includes(`data-volume="${cue.volume}"`) && tag.includes(`data-track-index="${cue.trackIndex}"`), `Audio cue ${cue.id} mix metadata differs`);
}

const renderCommand = packageJson.scripts?.["render:final"] ?? "";
invariant(renderCommand === "node scripts/render-final.mjs", "render:final must use the guarded V3 renderer");
invariant(packageJson.scripts?.["check:source"] === "node verify-video-gates.mjs --allow-placeholders", "check:source must use placeholder-safe V3 validation");
invariant(packageJson.scripts?.["gate:render"] === "node verify-video-gates.mjs", "gate:render must use strict V3 validation");

const pending = [];
if (captureLock.status !== "approved-v3-captures") pending.push("four approved V3 captures");
if (voice.status !== "approved-v3-single-batch") pending.push("one approved George multilingual-v2 batch");
if (ledger.status !== "approved-v3-single-batch") pending.push("one-call narration ledger");
if (captions.status !== "approved-v3-captions") pending.push("V3 captions");
if (motion.status !== "approved-v3-motion" || motion.assertions?.length !== 24) pending.push("24 final motion assertions");
if (storyScenes.some((scene) => field(scene.block, "status") !== "animated")) pending.push("eight newly animated V3 scenes");
if (/V3 SOURCE LOCK|CAPTURE PENDING|FINAL FRAME PENDING/iu.test(index)) pending.push("final 90-second assembled index");
const filmTruth = releaseProof.v3Film ?? {};
for (const flag of [
  "productCaptureComplete",
  "complexAgentCaptureComplete",
  "mcpNonBroadcastCaptureComplete",
  "retainedProofCaptureComplete",
  "singleBatchNarrationComplete",
  "captionsComplete",
  "eightNewScenesComplete",
]) {
  if (filmTruth[flag] !== true) pending.push(`release proof: ${flag}`);
}

if (allowPlaceholders) {
  process.stdout.write(`SOURCE GATE PASSED · exact 90.000s / 8 scenes / ${spokenWords.length} words · final render intentionally blocked by: ${[...new Set(pending)].join(", ")}\n`);
  process.exit(0);
}

invariant(pending.length === 0, `FINAL RENDER BLOCKED · ${[...new Set(pending)].join(", ")}`);

const deniedCaptures = new Set(superseded.captureSha256);
const deniedNarration = new Set(superseded.narrationSha256);
invariant(Array.isArray(captureLock.captures) && captureLock.captures.length === 4, "Approved capture lock must contain four V3 files");
invariant(typeof captureLock.attestationPath === "string", "Approved capture lock must identify its human review");
const captureAttestationPath = resolve(projectDir, captureLock.attestationPath);
invariant(captureAttestationPath.startsWith(`${projectDir}${sep}`), "Capture attestation path escapes the video project");
invariant(existsSync(captureAttestationPath) && sha256(readFileSync(captureAttestationPath)) === captureLock.attestationSha256, "Capture attestation file/hash differs");
const captureAttestation = JSON.parse(readFileSync(captureAttestationPath, "utf8"));
invariant(captureAttestation.schemaVersion === 3 && captureAttestation.status === "approved-human-review", "Capture attestation is not an approved V3 human review");
const captureReviews = new Map((captureAttestation.captures ?? []).map((item) => [item.id, item]));
invariant(captureReviews.size === 4, "Capture attestation must cover exactly four unique IDs");
const locks = new Map(captureLock.captures.map((item) => [item.id, item]));
for (const capture of captureContracts.captures) {
  const review = captureReviews.get(capture.id);
  invariant(review?.sourceMatches === true && review?.noSecretsOrPrivateIdentity === true && review?.noValueMovement === true, `Capture human review is incomplete: ${capture.id}`);
  invariant(capture.required.every((statement) => review.required?.[statement] === true), `Capture required-evidence review is incomplete: ${capture.id}`);
  invariant(capture.forbidden.every((statement) => review.forbiddenAbsent?.[statement] === true), `Capture forbidden-evidence review is incomplete: ${capture.id}`);
  const lock = locks.get(capture.id);
  invariant(lock?.path === capture.path, `Capture lock path differs: ${capture.id}`);
  invariant(!deniedCaptures.has(lock.sha256), `Capture ${capture.id} reuses a rejected V2 hash`);
  const absolute = join(projectDir, ...capture.path.split("/"));
  invariant(existsSync(absolute), `Capture is missing: ${capture.path}`);
  invariant(statSync(absolute).size === lock.bytes && fileSha(capture.path) === lock.sha256, `Capture hash/bytes differ: ${capture.id}`);
  if (capture.kind === "still") {
    const dimensions = pngDimensions(capture.path);
    invariant(dimensions.width >= captureContracts.global.minimumStill.width && dimensions.height >= captureContracts.global.minimumStill.height, `Capture resolution is too small: ${capture.id}`);
  } else {
    const probe = probeVideo(absolute);
    invariant(probe.width >= captureContracts.global.minimumVideo.width && probe.height >= captureContracts.global.minimumVideo.height, `Capture resolution is too small: ${capture.id}`);
    invariant(probe.fps >= captureContracts.global.minimumVideo.fps - 0.01, `Capture frame rate is too low: ${capture.id}`);
    invariant(probe.duration >= capture.minimumDurationSeconds, `Capture is too short: ${capture.id}`);
  }
}

invariant(voice.selectedProviderCalls === 1 && voice.master?.batchId, "Approved voice manifest does not identify one selected batch");
invariant(ledger.callSummary?.selectedProviderCalls === 1 && ledger.callSummary?.supersededProviderCalls === 0, "Approved narration ledger must contain exactly one provider call");
invariant(ledger.selectedBatch?.batchId === voice.master.batchId, "Voice manifest and generation ledger batch IDs differ");
invariant(ledger.callSummary?.attemptedProviderCalls === 1, "Approved narration ledger must prove exactly one attempted provider call");
const quotaPreflight = ledger.quotaPreflight;
const safeQuotaPreflightKeys = new Set([
  "checkedAt",
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
]);
invariant(quotaPreflight && Object.keys(quotaPreflight).length === safeQuotaPreflightKeys.size && Object.keys(quotaPreflight).every((key) => safeQuotaPreflightKeys.has(key)), "Narration quota preflight fields are incomplete or non-aggregate");
const exactNarrationCharacters = countElevenLabsNarrationCharacters(lockedLines.join("\n\n"));
invariant(quotaPreflight.sanitized === true && quotaPreflight.result === "approved" && quotaPreflight.reasonCode === "included_quota_sufficient", "Narration quota preflight was not approved");
invariant(typeof quotaPreflight.checkedAt === "string" && typeof quotaPreflight.extensionOrOverageAvailable === "boolean", "Narration quota preflight aggregate metadata is incomplete");
invariant(quotaPreflight.httpStatus === 200 && quotaPreflight.subscriptionActive === true, "Narration quota preflight did not verify an active subscription");
invariant(quotaPreflight.currentOverageIsZero === true && quotaPreflight.hasOpenInvoices === false && quotaPreflight.paymentPendingOrFailed === false, "Narration quota preflight found a billing issue");
invariant(quotaPreflight.exactNarrationCharacters === exactNarrationCharacters, "Narration quota preflight cost differs from the exact provider text");
invariant(quotaPreflight.safetyMultiplier >= ELEVENLABS_INCLUDED_QUOTA_SAFETY_MULTIPLIER, "Narration quota preflight safety multiplier is too small");
invariant(quotaPreflight.requiredIncludedCharacters >= Math.ceil(exactNarrationCharacters * quotaPreflight.safetyMultiplier), "Narration quota preflight did not conservatively price the exact text");
invariant(quotaPreflight.remainingIncludedCharacters >= quotaPreflight.requiredIncludedCharacters, "Narration generation required extension or overage");
invariant(voice.rawProviderResponse?.batchId === voice.master.batchId && voice.rawProviderResponse?.batchId === ledger.selectedBatch?.batchId, "Raw response, master, and ledger batch IDs differ");
invariant(voice.rawProviderResponse?.path === "assets/audio/voice-v3/finaltab-v3-george-provider-response.mp3", "Raw V3 provider response path differs");
invariant(voice.rawProviderResponse?.path === ledger.selectedBatch?.path && voice.rawProviderResponse?.sha256 === ledger.selectedBatch?.sha256, "Raw response and ledger evidence differ");
invariant(existsSync(join(projectDir, ...voice.rawProviderResponse.path.split("/"))), "Raw V3 provider response is missing");
invariant(statSync(join(projectDir, ...voice.rawProviderResponse.path.split("/"))).size === voice.rawProviderResponse.bytes && fileSha(voice.rawProviderResponse.path) === voice.rawProviderResponse.sha256, "Raw V3 provider response hash/bytes differ");
const narrationPath = join(projectDir, ...voice.master.path.split("/"));
invariant(existsSync(narrationPath), "V3 narration master is missing");
invariant(statSync(narrationPath).size === voice.master.bytes && fileSha(voice.master.path) === voice.master.sha256, "V3 narration master hash/bytes differ");
invariant(!deniedNarration.has(voice.master.sha256), "V3 narration reuses a rejected audio hash");
const narrationSourceSha = sha256(lockedLines.join("\n"));
invariant(voice.scriptNarrationSha256 === narrationSourceSha, "Voice manifest script hash differs");
invariant(ledger.selectedBatch?.scriptNarrationSha256 === narrationSourceSha, "Narration ledger script hash differs");

const alignment = readJson(voice.master.alignmentPath);
invariant(alignment.schemaVersion === 3 && alignment.status === "approved-v3-alignment", "V3 narration alignment is not approved");
invariant(alignment.timingMapping?.method === "monotonic-levenshtein-forced-v1", "V3 narration timing mapping method differs");
invariant(alignment.timingMapping?.lockedWordCount === 188 && alignment.timingMapping?.mappedWordCount === 188 && alignment.timingMapping?.fullMonotonicMapping === true, "V3 narration timing mapping is incomplete");
invariant(Number.isInteger(alignment.timingMapping?.rawAsrWordCount) && alignment.timingMapping.rawAsrWordCount >= 150 && alignment.timingMapping.rawAsrWordCount <= 220, "V3 narration raw ASR word count is implausible");
invariant(Number.isInteger(alignment.timingMapping?.rawAsrEditDistance) && alignment.timingMapping.rawAsrEditDistance >= 0, "V3 narration raw ASR edit distance is invalid");
invariant(alignment.timingMapping?.maximumRawAsrWordErrorRate === 0.15 && Number.isFinite(alignment.timingMapping?.rawAsrWordErrorRate) && alignment.timingMapping.rawAsrWordErrorRate >= 0 && alignment.timingMapping.rawAsrWordErrorRate <= 0.15, "V3 narration raw ASR WER exceeds 15%");
invariant(Array.isArray(alignment.scenes) && alignment.scenes.length === 8, "V3 alignment must contain eight scenes");
for (const [indexValue, scene] of alignment.scenes.entries()) {
  const expected = contract.scenes[indexValue];
  invariant(scene.scene === expected.scene && scene.text === expected.narration, `Alignment text differs for scene ${expected.scene}`);
  invariant(scene.start >= expected.start && scene.end <= expected.end && scene.end > scene.start, `Alignment escapes scene ${expected.scene}`);
  invariant(Number.isFinite(scene.atempoFactor) && scene.atempoFactor >= 1 && scene.atempoFactor <= 1.12, `Alignment tempo factor is outside the bounded 1.00–1.12 range for scene ${expected.scene}`);
  invariant(Array.isArray(scene.words) && scene.words.length > 0, `Alignment has no words for scene ${expected.scene}`);
  const priorWordCount = alignment.scenes.slice(0, indexValue).reduce((sum, item) => sum + item.words.length, 0);
  invariant(scene.words.every((word, wordIndex) => word.id === `w${priorWordCount + wordIndex}`), `Alignment word IDs are not contiguous in scene ${expected.scene}`);
  invariant(scene.words.every((word, wordIndex) => word.start >= expected.start && word.end <= expected.end && word.end > word.start && (wordIndex === 0 || word.start >= scene.words[wordIndex - 1].end)), `Alignment word timing is invalid in scene ${expected.scene}`);
}
const alignedWords = alignment.scenes.flatMap((scene) => scene.words);
invariant(alignedWords.length === 188, `Alignment contains ${alignedWords.length} words, not 188`);
invariant(JSON.stringify(normalizedWords(alignedWords.map((word) => word.text).join(" "))) === JSON.stringify(normalizedWords(lockedLines.join(" "))), "Alignment transcript differs from the exact locked 188-word narration");

invariant(voice.captionAssets?.status === "approved-v3-captions", "Voice manifest caption state differs");
const srt = readText("CAPTIONS.srt");
const vtt = readText("CAPTIONS.vtt");
const captionJsonSource = readText("data/caption-cues.json");
invariant(!/pending/iu.test(srt + vtt), "Caption files still contain pending markers");
invariant(captions.cues.length > 0 && new Set(captions.cues.map((cue) => cue.scene)).size === 8, "Caption cues do not cover all eight scenes");
invariant(words(captions.cues.flatMap((cue) => cue.lines).join(" ")).length === 188, "Caption cues do not contain exactly 188 words");
invariant(JSON.stringify(normalizedWords(captions.cues.flatMap((cue) => cue.lines).join(" "))) === JSON.stringify(normalizedWords(lockedLines.join(" "))), "Caption transcript differs from the exact locked narration");
invariant(captions.cues.every((cue, indexValue) => cue.start >= 0 && cue.end <= 90 && cue.end > cue.start && (indexValue === 0 || cue.start >= captions.cues[indexValue - 1].end)), "Caption cues overlap, escape the film, or have invalid timing");
invariant(voice.captionAssets.srtSha256 === sha256(srt), "SRT hash differs");
invariant(voice.captionAssets.vttSha256 === sha256(vtt), "VTT hash differs");
invariant(voice.captionAssets.cueJsonSha256 === sha256(captionJsonSource), "Caption cue hash differs");
invariant(voice.captionAssets.bakedIndexSha256 === sha256(index), "Baked index hash differs");
invariant(index.includes(contract.narration.masterPath), "Final index does not mount the approved V3 narration master");
invariant((captionBlock.match(/data-layout-allow-caption-zone/gu) ?? []).length === captions.cues.length, "Every rendered V3 caption cue must carry the caption-zone marker");
invariant(!/SOURCE LOCK|CAPTURE PENDING|FINAL FRAME PENDING|capture-slots\//iu.test(index), "Final index still contains a placeholder");

for (const scene of contract.scenes) {
  const absolute = join(projectDir, ...scene.src.split("/"));
  invariant(existsSync(absolute), `Final frame is missing: ${scene.src}`);
  const frame = readFileSync(absolute, "utf8");
  invariant(!/SOURCE LOCK|CAPTURE PENDING|FINAL FRAME PENDING/iu.test(frame), `Final frame still contains a placeholder: scene ${scene.scene}`);
  const gsapSelectors = [...frame.matchAll(/\.(?:fromTo|to|set)\("([^"]+)"/gu)].map((match) => match[1]);
  invariant(gsapSelectors.every((selector) => selector.startsWith(`#v3-${scene.scene}-`)), `Scene ${scene.scene} contains an unscoped GSAP selector`);
}
const architecture = readText(contract.scenes[3].src);
for (const phrase of ["KEEPERHUB", "EXECUTION SERVICE", "BASE SEPOLIA", "PUBLIC TEST NETWORK"]) {
  invariant(architecture.toLocaleUpperCase().includes(phrase), `Architecture frame is missing: ${phrase}`);
}
const mcpFrame = readText(contract.scenes[6].src);
for (const phrase of ["HARD STOP", "NO SIGNATURE", "NO SUBMIT", "NO MONEY MOVED", "EARLIER AUTHORIZED RUN", "READ ONLY", "NOT CREATED"]) {
  invariant(mcpFrame.toLocaleUpperCase().includes(phrase), `MCP frame is missing truth label: ${phrase}`);
}
invariant(!/<img[^>]+(?:logo|wordmark)/iu.test(readText(contract.scenes[0].src)), "Scene 1 must keep a text-only FINALTab wordmark");

process.stdout.write("FINAL RENDER GATE PASSED · V3 source, captures, one-batch narration, captions, and eight frames are approved\n");

if (renderedPath) {
  invariant(renderedTranscriptPath, "Rendered-master verification requires --rendered-transcript <independent-asr.json>");
  invariant(existsSync(renderedPath), `Rendered master is missing: ${renderedPath}`);
  const probe = probeVideo(renderedPath);
  invariant(probe.formatName.includes("mp4"), `Rendered master container is ${probe.formatName}, not MP4`);
  invariant(probe.streamCount === 2, `Rendered master must contain exactly one video and one audio stream, received ${probe.streamCount}`);
  invariant(probe.videoCodec === "h264", `Rendered master video codec is ${probe.videoCodec}, not H.264`);
  invariant(probe.pixelFormat === "yuv420p", `Rendered master pixel format is ${probe.pixelFormat}, not yuv420p`);
  invariant(probe.width === 3840 && probe.height === 2160, "Rendered master is not native 4K");
  invariant(Math.abs(probe.fps - 60) < 0.01, "Rendered master is not 60 fps");
  invariant(Math.abs(probe.duration - 90) <= (1 / 60) + 0.01, `Rendered master duration is ${probe.duration}, not 90.000 seconds`);
  invariant(!Number.isFinite(probe.videoDuration) || Math.abs(probe.videoDuration - 90) <= (1 / 60) + 0.01, `Rendered video stream duration is ${probe.videoDuration}, not 90.000 seconds`);
  invariant(probe.frameCount === 5400, `Rendered master has ${probe.frameCount} decoded frames, not 5400`);
  invariant(probe.hasAudio, "Rendered master has no audio stream");
  invariant(probe.audioCodec === "aac", `Rendered master audio codec is ${probe.audioCodec}, not AAC`);
  invariant(probe.audioSampleRate >= 44100 && probe.audioChannels >= 1, `Rendered master audio format is ${probe.audioSampleRate} Hz / ${probe.audioChannels} channels`);
  invariant(!Number.isFinite(probe.audioDuration) || Math.abs(probe.audioDuration - 90) <= 0.05, `Rendered audio stream duration is ${probe.audioDuration}, not 90.000 seconds`);
  invariant(existsSync(renderedTranscriptPath), `Rendered-master ASR transcript is missing: ${renderedTranscriptPath}`);
  const renderedTranscriptPayload = JSON.parse(readFileSync(renderedTranscriptPath, "utf8"));
  invariant(renderedTranscriptPayload.status === "rendered-master-asr", "Rendered-master transcript is not an independent ASR artifact");
  invariant(renderedTranscriptPayload.engine === "faster-whisper" && renderedTranscriptPayload.model === "base.en", "Rendered-master ASR engine/model differs");
  invariant(renderedTranscriptPayload.sourceMediaSha256 === sha256(readFileSync(renderedPath)), "Rendered-master ASR is not bound to this MP4");
  invariant(renderedTranscriptPayload.sourceMediaBytes === statSync(renderedPath).size, "Rendered-master ASR byte binding differs");
  const finalTranscript = transcriptWords(renderedTranscriptPayload);
  invariant(finalTranscript.length >= 150 && finalTranscript.length <= 220, `Rendered-master ASR contains an implausible ${finalTranscript.length} observed words`);
  invariant(finalTranscript.every((word, indexValue) => indexValue === 0 || word.start >= finalTranscript[indexValue - 1].start), "Rendered-master transcript is not time ordered");
  invariant(finalTranscript.at(-1).end <= 90.05, "Rendered-master transcript escapes the 90-second program");
  const expectedRenderedWords = normalizedWords(lockedLines.join(" "));
  const observedRenderedWords = normalizedWords(finalTranscript.map((word) => word.text).join(" "));
  const renderedWordErrorRate = editDistance(expectedRenderedWords, observedRenderedWords) / expectedRenderedWords.length;
  invariant(renderedWordErrorRate <= 0.15, `Rendered-master ASR word error rate is ${(renderedWordErrorRate * 100).toFixed(1)}%, above 15%`);
  const loudness = measureLoudness(renderedPath);
  const integrated = Number(loudness.input_i);
  const truePeak = Number(loudness.input_tp);
  invariant(Number.isFinite(integrated) && Math.abs(integrated - contract.mastering.integratedLufs) <= contract.mastering.toleranceLufs, `Rendered master loudness is ${integrated} LUFS`);
  invariant(Number.isFinite(truePeak) && truePeak <= contract.mastering.maxTruePeakDbtp + 0.1, `Rendered master true peak is ${truePeak} dBTP`);
  process.stdout.write(`FINAL RENDERED MASTER PASSED · 3840×2160 · 60 fps · ${probe.duration.toFixed(3)}s · ${integrated.toFixed(1)} LUFS · ${truePeak.toFixed(1)} dBTP · ASR WER ${(renderedWordErrorRate * 100).toFixed(1)}%\n`);
}
