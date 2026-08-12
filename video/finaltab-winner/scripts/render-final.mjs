import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = resolve(projectDir, "../../proof-output/finaltab-winner");
const rawPath = join(outputDir, "finaltab-winner-90s-4k-raw.mp4");
const finalPath = join(outputDir, "finaltab-winner-90s-4k.mp4");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: projectDir, stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed${result.error ? `: ${result.error.message}` : ""}`);
  }
}

mkdirSync(outputDir, { recursive: true });
run(process.execPath, ["verify-video-gates.mjs"], "Strict V3 pre-render gate");
run(npx, [
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
run(process.execPath, ["verify-video-gates.mjs", "--rendered", finalPath], "Rendered-master gate");
process.stdout.write(`FINALTab V3 master written to ${finalPath}\n`);
