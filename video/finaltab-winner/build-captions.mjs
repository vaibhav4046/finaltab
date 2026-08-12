import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizedWords, scriptNarrationLines, words } from "./scripts/v3-tooling.mjs";

const projectDir = dirname(fileURLToPath(import.meta.url));
const pathFor = (relative) => join(projectDir, ...relative.split("/"));
const readJson = (relative) => JSON.parse(readFileSync(pathFor(relative), "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const fmtSrt = (seconds) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hh = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const mm = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${hh}:${mm}:${ss},${String(ms % 1000).padStart(3, "0")}`;
};
const fmtVtt = (seconds) => fmtSrt(seconds).replace(",", ".");

function splitLines(items, maxLength = 42) {
  const lines = [""];
  for (const item of items) {
    const word = item.text.trim();
    const candidate = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
    if (candidate.length <= maxLength) lines[lines.length - 1] = candidate;
    else if (lines.length === 1 && word.length <= maxLength) lines.push(word);
    else return null;
  }
  return lines;
}

function sceneCues(scene) {
  const cues = [];
  let buffer = [];
  const danglingNegations = new Set(["no", "not", "never", "without"]);
  const flush = () => {
    if (!buffer.length) return;
    const lines = splitLines(buffer);
    invariant(lines, `Caption group cannot fit scene ${scene.scene}`);
    cues.push({
      scene: scene.scene,
      start: buffer[0].start,
      end: Math.min(scene.end, buffer.at(-1).end + 0.08),
      lines,
    });
    buffer = [];
  };
  for (const word of scene.words) {
    const candidate = [...buffer, word];
    if (splitLines(candidate)) buffer = candidate;
    else {
      const previous = buffer.at(-1);
      const previousToken = previous?.text.trim().toLowerCase().replace(/[^a-z]/gu, "");
      if (buffer.length > 1 && danglingNegations.has(previousToken)) {
        buffer.pop();
        flush();
        buffer = [previous, word];
      } else {
        flush();
        buffer = [word];
      }
    }
  }
  flush();
  return cues.map((cue, index) => ({
    ...cue,
    end: Math.min(cue.end, cues[index + 1]?.start ?? scene.end),
  }));
}

const contract = readJson("data/v3-source-contract.json");
const lockedLines = scriptNarrationLines(readFileSync(pathFor("SCRIPT.md"), "utf8"));
invariant(contract.wordCount === 183 && lockedLines.length === 8, "Frozen V3 narration contract must contain eight lines and exactly 183 words");
invariant(words(lockedLines.join(" ")).length === 183, "SCRIPT.md must contain exactly 183 spoken words");
invariant(lockedLines.every((line, index) => line === contract.scenes[index]?.narration), "SCRIPT.md differs from the frozen V3 narration contract");
const voice = readJson("data/voiceover-manifest.json");
invariant(voice.status === "approved-v3-local-offline", "Approved offline V3 narration is required before captions");
const alignment = readJson(voice.master.alignmentPath);
invariant(alignment.schemaVersion === 3 && alignment.status === "approved-v3-alignment", "Approved V3 alignment is required");
invariant(Array.isArray(alignment.scenes) && alignment.scenes.length === 8, "Alignment must contain eight scenes");
const alignedWords = alignment.scenes.flatMap((scene) => scene.words ?? []);
invariant(alignedWords.length === 183, `Alignment must contain exactly 183 words, received ${alignedWords.length}`);
invariant(
  JSON.stringify(normalizedWords(alignedWords.map((word) => word.text).join(" "))) === JSON.stringify(normalizedWords(lockedLines.join(" "))),
  "Alignment word sequence differs from the exact locked 183-word narration",
);
for (const [index, scene] of alignment.scenes.entries()) {
  const expected = contract.scenes[index];
  invariant(scene.scene === expected.scene && scene.text === expected.narration, `Alignment text differs for scene ${expected.scene}`);
  invariant(scene.words.every((word) => word.start >= expected.start && word.end <= expected.end && word.end > word.start), `Alignment words escape scene ${expected.scene}`);
}
const cues = alignment.scenes.flatMap(sceneCues);
invariant(new Set(cues.map((cue) => cue.scene)).size === 8, "Captions must cover all eight scenes");
invariant(words(cues.flatMap((cue) => cue.lines).join(" ")).length === 183, "Caption cues must contain exactly 183 words");
invariant(cues.every((cue) => !/^(?:money|value) moves\b/iu.test(cue.lines.join(" "))), "A value-movement caption cannot lose its leading negation");

const cuePayload = {
  schemaVersion: 3,
  status: "approved-v3-captions",
  durationSeconds: 90,
  maxLineLength: 42,
  scriptWordCount: 183,
  cues,
};
const cueSource = `${JSON.stringify(cuePayload, null, 2)}\n`;
const srt = `${cues.map((cue, index) => `${index + 1}\n${fmtSrt(cue.start)} --> ${fmtSrt(cue.end)}\n${cue.lines.join("\n")}`).join("\n\n")}\n`;
const vtt = `WEBVTT\n\n${cues.map((cue) => `${fmtVtt(cue.start)} --> ${fmtVtt(cue.end)}\n${cue.lines.join("\n")}`).join("\n\n")}\n`;
let index = readFileSync(pathFor("index.html"), "utf8");
const captionMarkup = [
  "    <!-- V3_CAPTIONS_START -->",
  `    <audio id="v3-narration-master" src="${escapeHtml(voice.master.path)}" data-start="0" data-duration="90" data-track-index="30" data-volume="1"></audio>`,
  "    <style id=\"v3-caption-style\">.v3-caption-cue.clip{inset:auto 240px 60px;height:144px;box-sizing:border-box;margin:0;padding:18px 34px;border:2px solid rgba(183,192,184,.45);border-radius:22px;background:rgba(5,7,6,.94);color:#F4F8F1;text-align:center;font:650 46px/1.16 Geist,Arial,sans-serif}.v3-caption-line{display:block;white-space:nowrap}</style>",
  ...cues.map((cue, indexValue) => `    <p id="v3-caption-${String(indexValue + 1).padStart(2, "0")}" class="clip caption-cue v3-caption-cue" data-layout-allow-caption-zone data-start="${cue.start.toFixed(6)}" data-duration="${(cue.end - cue.start).toFixed(6)}" data-track-index="${40 + indexValue}">${cue.lines.map((line) => `<span class="v3-caption-line">${escapeHtml(line)}</span>`).join("")}</p>`),
  "    <!-- V3_CAPTIONS_END -->",
].join("\n");
invariant(/<!-- V3_CAPTIONS_START -->[\s\S]*?<!-- V3_CAPTIONS_END -->/u.test(index), "index.html caption markers are missing");
index = index.replace(/<!-- V3_CAPTIONS_START -->[\s\S]*?<!-- V3_CAPTIONS_END -->/u, captionMarkup.trim());

writeFileSync(pathFor("data/caption-cues.json"), cueSource);
writeFileSync(pathFor("CAPTIONS.srt"), srt);
writeFileSync(pathFor("CAPTIONS.vtt"), vtt);
writeFileSync(pathFor("index.html"), index);

voice.captionAssets = {
  status: "approved-v3-captions",
  cueJsonSha256: hash(cueSource),
  srtSha256: hash(srt),
  vttSha256: hash(vtt),
  bakedIndexSha256: hash(index),
};
writeFileSync(pathFor("data/voiceover-manifest.json"), `${JSON.stringify(voice, null, 2)}\n`);
const releaseProof = readJson("data/release-proof.json");
releaseProof.v3Film.captionsComplete = true;
writeFileSync(pathFor("data/release-proof.json"), `${JSON.stringify(releaseProof, null, 2)}\n`);
process.stdout.write(`Built ${cues.length} V3 caption cues across eight scenes\n`);
