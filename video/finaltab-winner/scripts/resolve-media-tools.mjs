import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));

function executableFromPackage(packageName) {
  try {
    const value = require(packageName);
    return typeof value === "string" ? value : value?.path ?? value?.default ?? null;
  } catch (error) {
    if (error?.code === "MODULE_NOT_FOUND") return null;
    throw error;
  }
}

function executableOnPath(name, env) {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookup, [name], { encoding: "utf8", env, windowsHide: true });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout).split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? null;
}

function assertExecutable(path, label) {
  if (!path || !existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${label} executable is unavailable. Run npm install in ${projectDir}.`);
  }
  const result = spawnSync(path, ["-version"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} could not execute${result.error ? `: ${result.error.message}` : ""}`);
  }
  const version = String(result.stdout || result.stderr).split(/\r?\n/u).find(Boolean)?.trim() ?? "version unknown";
  return { path: resolve(path), version };
}

export function resolveMediaTools(baseEnv = process.env) {
  const ffmpegCandidate = baseEnv.FFMPEG_PATH
    || executableFromPackage("ffmpeg-static")
    || executableOnPath("ffmpeg", baseEnv);
  const ffprobeCandidate = baseEnv.FFPROBE_PATH
    || executableFromPackage("@derhuerst/ffprobe-static")
    || executableOnPath("ffprobe", baseEnv);

  const ffmpeg = assertExecutable(ffmpegCandidate, "FFmpeg");
  const ffprobe = assertExecutable(ffprobeCandidate, "FFprobe");
  const pathKey = Object.keys(baseEnv).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const toolDirs = [...new Set([dirname(ffmpeg.path), dirname(ffprobe.path)])];
  const env = {
    ...baseEnv,
    [pathKey]: [...toolDirs, baseEnv[pathKey]].filter(Boolean).join(delimiter),
    FFMPEG_PATH: ffmpeg.path,
    FFPROBE_PATH: ffprobe.path,
  };

  return { ffmpeg, ffprobe, env };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ffmpeg, ffprobe } = resolveMediaTools();
  process.stdout.write(`${JSON.stringify({ ffmpeg, ffprobe }, null, 2)}\n`);
}
