import { createHash } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const proofDir = resolve(projectDir, "../../proof-output/finaltab-winner/voiceover");
const assetDir = join(projectDir, "assets", "audio", "voice");
const manifestPath = join(projectDir, "data", "voiceover-manifest.json");
const sceneStarts = [0.65, 6.2, 16.4, 31.4, 44.2, 56.35, 66.25, 73.15, 91.05];
const sceneEnds = [6, 16, 31, 44, 56, 66, 73, 91, 96];
const maxLineLength = 42;
let temporaryFileCounter = 0;
const captionPhrases = [
  [
    "A shared bill should end with everyone certain—",
    "and no one chasing screenshots.",
  ],
  [
    "FINALTab turns a receipt into a deterministic ledger,",
    "binds each debtor's USDC pull to the whole payout plan,",
    "then sends the exact call through KeeperHub.",
  ],
  [
    "Sign in. Scan a crowded receipt.",
    "Correct the extraction. Add participants.",
    "Describe who had what. FINALTab reconciles every line—",
    "tax, tip, and service included—",
    "to the cent.",
  ],
  [
    "A four-stage review attests the current inputs;",
    "any edit invalidates it.",
    "Freeze only after a fresh review,",
    "and the ledger, debits, payouts, chain, and contract become one immutable plan.",
  ],
  [
    "Circle permits the USDC pull;",
    "FINALTab binds every payout.",
    "KeeperHub simulates first.",
    "Consumed proof cannot move again.",
  ],
  [
    "KeeperHub submitted once with operator authorization.",
    "Its receipt and Base Sepolia independently match",
    "transaction, settlement ID, and ledger hash.",
  ],
  [
    "Agents use the same safety rail through nine production MCP tools.",
    "FINALTab never holds wallet keys.",
  ],
  [
    "A real MCP client authenticates, lists nine tools,",
    "allocates the receipt, prepares V2 typed data,",
    "and creates an approval challenge.",
    "Then it stops: no wallet signature, submit, or value move.",
    "A read-only panel verifies the retained settlement.",
  ],
  ["FINALTab: KeeperHub executes. Anyone verifies."],
];

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSource(value) {
  return value.replace(/\r\n?/gu, "\n");
}

async function writeAtomic(path, value) {
  temporaryFileCounter += 1;
  const expectedSha256 = sha256(value);
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${temporaryFileCounter}.tmp`,
  );
  try {
    await writeFile(temporaryPath, value, { encoding: "utf8", flag: "wx" });
    invariant(sha256(await readFile(temporaryPath)) === expectedSha256, `Temporary write hash differs: ${path}`);
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function canonicalText(value) {
  return value.replace(/\s+/gu, " ").replace(/\s*—\s*/gu, "—").trim();
}

function timedPhrases(alignment, phrases) {
  const characters = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;
  invariant(Array.isArray(characters) && Array.isArray(starts) && Array.isArray(ends), "Alignment is missing character timing arrays");
  const joined = characters.join("");
  let cursor = 0;
  return phrases.map((text) => {
    const startIndex = joined.indexOf(text, cursor);
    invariant(startIndex >= 0, `Caption phrase was not found in alignment: ${text}`);
    const endIndex = startIndex + text.length - 1;
    cursor = endIndex + 1;
    return { text, start: Number(starts[startIndex]), end: Number(ends[endIndex]) };
  });
}

function wrap(text) {
  const lines = [];
  for (const word of text.split(/\s+/u)) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > maxLineLength) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines;
}

function subtitleTime(seconds, separator) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}

function html(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function numberLiteral(value) {
  return Number(value.toFixed(3)).toString();
}

const script = await readFile(join(projectDir, "SCRIPT.md"), "utf8");
const scriptLines = [...script.matchAll(/^ {4}(.+)$/gm)].map((match) => match[1].trim());
invariant(scriptLines.length === 9, "SCRIPT.md must contain exactly nine indented narration lines");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
invariant(Array.isArray(manifest.scenes) && manifest.scenes.length === 9, "Voiceover manifest must contain exactly nine scenes");
invariant(Array.isArray(manifest.changedScenesPendingRegeneration) && manifest.changedScenesPendingRegeneration.length === 0, "Changed narration scenes are still pending regeneration");
invariant(
  manifest.status === "generated-awaiting-caption-sync" || manifest.status === "approved-final-capture-sync",
  "Voiceover manifest is not ready for caption sync",
);
invariant(manifest.captureLockAcknowledged === true, "Canonical capture lock was not acknowledged during selective generation");

const cues = [];
for (const scene of manifest.scenes) {
  const index = Number(scene.scene) - 1;
  invariant(scene.text === scriptLines[index], `Voice text does not match SCRIPT.md for scene ${scene.scene}`);
  const record = JSON.parse(await readFile(join(assetDir, scene.alignment), "utf8"));
  invariant(record.text === scene.text, `Alignment text does not match voice manifest for scene ${scene.scene}`);
  const phrases = captionPhrases[index];
  invariant(canonicalText(phrases.join(" ")) === canonicalText(scene.text), `Caption phrases do not reproduce scene ${scene.scene} exactly`);
  const timed = timedPhrases(record.originalAlignment ?? record.alignment, phrases);
  const audioEnd = sceneStarts[index] + Number(scene.durationSeconds);
  invariant(audioEnd <= sceneEnds[index] + 0.015, `Scene ${scene.scene} audio ends outside its frame`);

  for (const phrase of timed) {
    const lines = wrap(phrase.text);
    invariant(lines.length <= 2 && lines.every((line) => line.length <= maxLineLength), `Caption wrapping failed for scene ${scene.scene}: ${phrase.text}`);
    cues.push({
      scene: scene.scene,
      start: sceneStarts[index] + phrase.start,
      end: Math.min(sceneStarts[index] + phrase.end + 0.04, sceneEnds[index] - 0.02),
      lines,
    });
  }
}

for (let index = 0; index < cues.length - 1; index += 1) {
  if (cues[index].end >= cues[index + 1].start) {
    cues[index].end = Math.max(cues[index].start + 0.08, cues[index + 1].start - 0.02);
  }
}
invariant(cues.every((cue) => cue.end > cue.start), "Caption cue has a non-positive duration");

const srt = cues.map((cue, index) => [
  String(index + 1),
  `${subtitleTime(cue.start, ",")} --> ${subtitleTime(cue.end, ",")}`,
  ...cue.lines,
  "",
].join("\n")).join("\n");
const vtt = `WEBVTT\n\n${cues.map((cue, index) => [
  String(index + 1),
  `${subtitleTime(cue.start, ".")} --> ${subtitleTime(cue.end, ".")}`,
  ...cue.lines,
  "",
].join("\n")).join("\n")}`;

const cuePayload = {
  status: "approved-final-capture-sync",
  durationSeconds: 96,
  maxLineLength,
  scriptSha256: sha256(canonicalSource(script)),
  cues,
};
const cueJson = `${JSON.stringify(cuePayload, null, 2)}\n`;
cuePayload.sha256 = sha256(cueJson);

const captionMarkup = cues.map((cue, index) => {
  const id = String(index + 1).padStart(2, "0");
  return `      <p id="cap-${id}" class="caption-cue">${cue.lines.map(html).join("<br/>")}</p>`;
}).join("\n");
const captionTimeline = cues.map((cue, index) => {
  const id = String(index + 1).padStart(2, "0");
  const start = numberLiteral(cue.start);
  const fadeOut = numberLiteral(Math.max(cue.start + 0.18, cue.end - 0.14));
  const end = numberLiteral(cue.end);
  return [
    `    tl.set("#cap-${id}",{visibility:"visible"},${start});`,
    `    tl.fromTo("#cap-${id}",{opacity:0,y:10},{opacity:1,y:0,duration:.16,ease:"sine.out"},${start}).to("#cap-${id}",{opacity:0,duration:.14,ease:"sine.in"},${fadeOut});`,
    `    tl.set("#cap-${id}",{opacity:0,visibility:"hidden"},${end});`,
  ].join("\n");
}).join("\n");
const voiceMarkup = manifest.scenes.map((scene, index) => {
  const id = String(scene.scene).padStart(2, "0");
  return `    <audio id="voice-${id}" class="clip media-clip" src="assets/audio/voice/${scene.audio}" preload="auto" data-start="${sceneStarts[index]}" data-duration="${Number(scene.durationSeconds).toFixed(3)}" data-track-index="30"></audio>`;
}).join("\n");

let indexHtml = await readFile(join(projectDir, "index.html"), "utf8");
indexHtml = indexHtml.replace(
  /(<!-- GENERATED CAPTIONS START -->)[\s\S]*?(<!-- GENERATED CAPTIONS END -->)/u,
  `$1\n${captionMarkup}\n      $2`,
);
indexHtml = indexHtml.replace(
  /(<!-- GENERATED VOICE CLIPS START -->)[\s\S]*?(<!-- GENERATED VOICE CLIPS END -->)/u,
  `$1\n${voiceMarkup}\n    $2`,
);
indexHtml = indexHtml.replace(
  /(\/\/ GENERATED CAPTION TIMELINE START)[\s\S]*?(\/\/ GENERATED CAPTION TIMELINE END)/u,
  `$1\n${captionTimeline}\n    $2`,
);
invariant(indexHtml.includes('id="cap-01"') && indexHtml.includes(`id="cap-${String(cues.length).padStart(2, "0")}"`), "Failed to update baked captions");
invariant(indexHtml.includes('id="voice-09"'), "Failed to update voice clips");

await writeAtomic(join(projectDir, "CAPTIONS.srt"), srt);
await writeAtomic(join(projectDir, "CAPTIONS.vtt"), vtt);
await writeAtomic(join(projectDir, "data", "caption-cues.json"), `${JSON.stringify(cuePayload, null, 2)}\n`);
await writeAtomic(join(proofDir, "cue-sheet.json"), `${JSON.stringify(cuePayload, null, 2)}\n`);
await writeAtomic(join(projectDir, "index.html"), indexHtml);

manifest.status = "approved-final-capture-sync";
manifest.regenerateAfterApprovedCaptures = false;
manifest.captionSyncRequired = false;
manifest.purpose = "Scenes 3, 4, 5, 6, and 8 are the selected ElevenLabs Flash v2.5 MP3s from protected, expiring, fixed-scene Vercel release candidates. The ledger records one call per selected exact text plus four superseded over-budget attempts; scenes 1, 2, 7, and 9 retain their approved Multilingual v2 audio. Captions, timing, proof assets, and manifests are synchronized.";
manifest.scriptSha256 = sha256(canonicalSource(script));
manifest.captionAssets = {
  cueJsonSha256: sha256(`${JSON.stringify(cuePayload, null, 2)}\n`),
  srtSha256: sha256(srt),
  vttSha256: sha256(vtt),
  bakedIndexSha256: sha256(indexHtml),
};
const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
// The local manifest is the commit marker for the caption package. Keep it last
// so any earlier failure leaves the previous valid commit marker and is rerunnable.
await writeAtomic(join(proofDir, "manifest.json"), serializedManifest);
await writeAtomic(manifestPath, serializedManifest);
process.stdout.write(`Built and synchronized ${cues.length} aligned cues through ${cues.at(-1).end.toFixed(2)}s\n`);
