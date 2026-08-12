import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
      flush();
      buffer = [word];
    }
  }
  flush();
  return cues;
}

const voice = readJson("data/voiceover-manifest.json");
invariant(voice.status === "approved-v3-single-batch", "Approved V3 narration is required before captions");
const alignment = readJson(voice.master.alignmentPath);
invariant(alignment.schemaVersion === 3 && alignment.status === "approved-v3-alignment", "Approved V3 alignment is required");
invariant(Array.isArray(alignment.scenes) && alignment.scenes.length === 8, "Alignment must contain eight scenes");
const cues = alignment.scenes.flatMap(sceneCues);
invariant(new Set(cues.map((cue) => cue.scene)).size === 8, "Captions must cover all eight scenes");

const cuePayload = {
  schemaVersion: 3,
  status: "approved-v3-captions",
  durationSeconds: 90,
  maxLineLength: 42,
  scriptWordCount: 188,
  cues,
};
const cueSource = `${JSON.stringify(cuePayload, null, 2)}\n`;
const srt = `${cues.map((cue, index) => `${index + 1}\n${fmtSrt(cue.start)} --> ${fmtSrt(cue.end)}\n${cue.lines.join("\n")}\n`).join("\n")}\n`;
const vtt = `WEBVTT\n\n${cues.map((cue) => `${fmtVtt(cue.start)} --> ${fmtVtt(cue.end)}\n${cue.lines.join("\n")}\n`).join("\n")}\n`;
let index = readFileSync(pathFor("index.html"), "utf8");
const captionMarkup = [
  "    <!-- V3_CAPTIONS_START -->",
  "    <style id=\"v3-caption-style\">.v3-caption-cue.clip{inset:auto;left:50%;bottom:60px;transform:translateX(-50%);width:max-content;max-width:3000px;margin:0;padding:22px 34px;border:2px solid rgba(183,192,184,.45);border-radius:22px;background:rgba(5,7,6,.94);color:#F4F8F1;text-align:center;font:650 46px/1.22 Geist,Arial,sans-serif}</style>",
  ...cues.map((cue, indexValue) => `    <p id="v3-caption-${String(indexValue + 1).padStart(2, "0")}" class="clip v3-caption-cue" data-start="${cue.start.toFixed(3)}" data-duration="${(cue.end - cue.start).toFixed(3)}" data-track-index="20">${cue.lines.map(escapeHtml).join("<br/>")}</p>`),
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
process.stdout.write(`Built ${cues.length} V3 caption cues across eight scenes\n`);
