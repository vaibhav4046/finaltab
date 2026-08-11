import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const voiceDir = resolve(projectDir, "../../proof-output/finaltab-winner/voiceover");
const sceneStarts = [0.65, 6.2, 16.4, 31.4, 44.2, 56.35, 66.25, 73.15, 91.05];
const sceneEnds = [6, 16, 31, 44, 56, 66, 73, 91, 96];
const maxLineLength = 42;
const canonicalText = (value) => value.replace(/\s+/gu, " ").replace(/\s*—\s*/gu, "—").trim();
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
    "Scan a crowded receipt. Correct any extraction.",
    "Invite the table. Describe who had what.",
    "FINALTab reconciles every line—",
    "tax, tip, and service included—",
    "to the cent, across the whole table.",
  ],
  [
    "The graph collapses many obligations",
    "into a small, deterministic transfer set.",
    "Freeze once, and the ledger hash, settlement ID,",
    "debits, payouts, chain, and contract become one immutable plan.",
  ],
  [
    "Each debtor signs twice:",
    "Circle authorizes their exact USDC pull;",
    "FINALTab binds consent to the complete payout plan.",
    "KeeperHub then simulates. A revert never broadcasts.",
  ],
  [
    "After simulation and a final human signature, KeeperHub submits.",
    "Green appears when its receipt matches",
    "an independent Base Sepolia RPC check.",
  ],
  [
    "Agents use the same safety rail through nine production MCP tools.",
    "FINALTab never holds wallet keys.",
  ],
  [
    "The agent allocates, prepares the V2 plan,",
    "and returns debtor typed data.",
    "It simulates, gets a short-lived human signature, then submits.",
    "Status receives execution ID, settlement ID, and ledger hash.",
    "Only the indexed event becomes VERIFIED_SETTLED.",
  ],
  ["FINALTab: KeeperHub executes. Anyone verifies."],
];

function timedPhrases(alignment, phrases) {
  const characters = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) {
    throw new Error("Alignment is missing character timing arrays");
  }
  const joined = characters.join("");
  let cursor = 0;
  return phrases.map((text) => {
    const startIndex = joined.indexOf(text, cursor);
    if (startIndex < 0) throw new Error(`Caption phrase was not found in alignment: ${text}`);
    const endIndex = startIndex + text.length - 1;
    cursor = endIndex + 1;
    return {
      text,
      start: Number(starts[startIndex]),
      end: Number(ends[endIndex]),
    };
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

function srtTime(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

const manifest = JSON.parse(await readFile(join(voiceDir, "manifest.json"), "utf8"));
if (!Array.isArray(manifest.scenes) || manifest.scenes.length !== 9) {
  throw new Error("Voiceover manifest must contain exactly nine scenes");
}

const cues = [];
for (const scene of manifest.scenes) {
  const index = Number(scene.scene) - 1;
  const record = JSON.parse(await readFile(join(voiceDir, scene.alignment), "utf8"));
  const phrases = captionPhrases[index];
  if (canonicalText(phrases.join(" ")) !== canonicalText(scene.text)) {
    throw new Error(`Caption phrases do not reproduce scene ${scene.scene} exactly`);
  }
  const timed = timedPhrases(record.originalAlignment ?? record.alignment, phrases);
  const audioEnd = sceneStarts[index] + Number(scene.durationSeconds);
  if (audioEnd > sceneEnds[index] + 0.015) {
    throw new Error(`Scene ${scene.scene} audio ends at ${audioEnd.toFixed(3)}s, outside its ${sceneEnds[index]}s frame`);
  }
  for (const phrase of timed) {
    const text = phrase.text;
    const lines = wrap(text);
    if (lines.length > 2 || lines.some((line) => line.length > maxLineLength)) {
      throw new Error(`Caption wrapping failed for scene ${scene.scene}: ${text}`);
    }
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
if (cues.some((cue) => cue.end <= cue.start)) throw new Error("Caption cue has a non-positive duration");

const srt = cues.map((cue, index) => [
  String(index + 1),
  `${srtTime(cue.start)} --> ${srtTime(cue.end)}`,
  ...cue.lines,
  "",
].join("\n")).join("\n");

await writeFile(join(projectDir, "CAPTIONS.srt"), srt, "utf8");
await writeFile(
  join(voiceDir, "cue-sheet.json"),
  `${JSON.stringify({ durationSeconds: 96, maxLineLength, cues }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`Built ${cues.length} aligned caption cues through ${cues.at(-1).end.toFixed(2)}s\n`);
