import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveMediaTools } from "./resolve-media-tools.mjs";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = resolve(projectDir, "../../proof-output/finaltab-winner");
const rawPath = join(outputDir, "finaltab-winner-90s-4k-raw.mp4");
const finalPath = join(outputDir, "finaltab-winner-90s-4k.mp4");
const renderedTranscriptPath = join(outputDir, "finaltab-winner-90s-rendered-asr.json");
const npmExecPath = process.env.npm_execpath;
const npxCli = process.platform === "win32" && npmExecPath
  ? join(dirname(npmExecPath), "npx-cli.js")
  : null;
if (process.platform === "win32" && (!npxCli || !existsSync(npxCli))) {
  throw new Error("Windows render requires npm_execpath so npx-cli.js can run without the .cmd shell wrapper");
}
const npx = process.platform === "win32" ? process.execPath : "npx";
const npxPrefix = npxCli ? [npxCli] : [];
const python = process.platform === "win32" ? "py" : "python3";
const { env: mediaToolsEnv } = resolveMediaTools();

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: projectDir,
    env: mediaToolsEnv,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed${result.error ? `: ${result.error.message}` : ""}`);
  }
}

mkdirSync(outputDir, { recursive: true });
run(process.execPath, ["verify-video-gates.mjs"], "Strict V3 pre-render gate");
run(npx, [
  ...npxPrefix,
  "--yes", "hyperframes@0.7.106", "render",
  "--fps", "60",
  "--resolution", "landscape-4k",
  "--video-frame-format", "png",
  "--quality", "high",
  "--low-memory-mode",
  "--frames-cache-dir", "off",
  "--strict-all",
  "--no-best-effort",
  "--skill", "product-launch-video",
  "-o", rawPath,
], "Raw 4K60 render");
run(process.execPath, ["scripts/master-final-audio.mjs", rawPath, finalPath], "Two-pass -14 LUFS master");
run(python, [...(process.platform === "win32" ? ["-3"] : []), "scripts/transcribe-rendered-master.py", "--media", finalPath, "--output", renderedTranscriptPath], "Independent rendered-audio ASR");
run(process.execPath, ["verify-video-gates.mjs", "--rendered", finalPath, "--rendered-transcript", renderedTranscriptPath], "Rendered technical/transcript gate");
process.stdout.write(`FINALTab V3 master written to ${finalPath}\n`);
