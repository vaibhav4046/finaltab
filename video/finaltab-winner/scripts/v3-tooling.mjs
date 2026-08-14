import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function words(value) {
  return String(value).match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) ?? [];
}

export function normalizedWords(value) {
  return words(value).map((word) => word.replaceAll("’", "'").toLocaleLowerCase("en-US"));
}

export function scriptNarrationLines(source) {
  return [...String(source).matchAll(/^ {4}(.+)$/gmu)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJsonAtomic(path, payload) {
  writeTextAtomic(path, `${JSON.stringify(payload, null, 2)}\n`);
}

export function writeTextAtomic(path, source) {
  const tempPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tempPath, source, { encoding: "utf8", flag: "wx" });
  renameSync(tempPath, path);
}

export function resolveInside(root, candidate, label = "path") {
  invariant(typeof candidate === "string" && candidate.trim(), `${label} is required`);
  const absolute = resolve(root, candidate);
  const rel = relative(resolve(root), absolute);
  invariant(rel !== "" || isAbsolute(candidate), `${label} must name a file below the project directory`);
  invariant(!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel), `${label} escapes the project directory`);
  return absolute;
}

export function parseArgs(argv, valueFlags = []) {
  const values = new Set(valueFlags);
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }
    const name = token.slice(2);
    if (values.has(name)) {
      const value = argv[index + 1];
      invariant(value && !value.startsWith("--"), `--${name} requires a value`);
      parsed[name] = value;
      index += 1;
    } else {
      parsed[name] = true;
    }
  }
  return parsed;
}

export function fileUrlProjectDir(metaUrl) {
  return dirname(new URL(metaUrl).pathname);
}
