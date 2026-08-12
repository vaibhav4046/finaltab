import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const input = resolve(projectDir, process.argv[2] ?? "");
const output = resolve(projectDir, process.argv[3] ?? "");
if (!process.argv[2] || !process.argv[3]) throw new Error("Usage: node scripts/master-final-audio.mjs <raw.mp4> <final.mp4>");
if (!existsSync(input)) throw new Error(`Raw render is missing: ${input}`);

const sink = process.platform === "win32" ? "NUL" : "/dev/null";
const analyze = spawnSync("ffmpeg", [
  "-hide_banner", "-nostats", "-i", input,
  "-af", "loudnorm=I=-14:LRA=7:TP=-1:print_format=json",
  "-f", "null", sink,
], { encoding: "utf8", windowsHide: true });
if (analyze.error) throw analyze.error;
const matches = [...String(analyze.stderr).matchAll(/\{\s*"input_i"[\s\S]*?\}/gu)];
if (analyze.status !== 0 || matches.length === 0) throw new Error(`Loudness analysis failed: ${analyze.stderr}`);
const measured = JSON.parse(matches.at(-1)[0]);
const filter = [
  "loudnorm=I=-14:LRA=7:TP=-1",
  `measured_I=${measured.input_i}`,
  `measured_LRA=${measured.input_lra}`,
  `measured_TP=${measured.input_tp}`,
  `measured_thresh=${measured.input_thresh}`,
  `offset=${measured.target_offset}`,
  "linear=true",
  "print_format=summary",
].join(":");
const master = spawnSync("ffmpeg", [
  "-hide_banner", "-y", "-i", input,
  "-map", "0:v:0", "-map", "0:a:0",
  "-c:v", "copy",
  "-af", filter,
  "-c:a", "aac", "-b:a", "192k",
  "-movflags", "+faststart",
  output,
], { stdio: "inherit", windowsHide: true });
if (master.error || master.status !== 0) throw new Error(`Final loudness master failed${master.error ? `: ${master.error.message}` : ""}`);
process.stdout.write(`Two-pass master complete: -14 LUFS integrated, -1 dBTP ceiling → ${output}\n`);
