#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(repositoryRoot, "proof-output");
const outputPath = resolve(outputDirectory, "finaltab-mcp-token.local.json");
const relativeOutputPath = relative(repositoryRoot, outputPath).replaceAll("\\", "/");
const gitignore = readFileSync(resolve(repositoryRoot, ".gitignore"), "utf8");

// pnpm forwards its conventional `--` separator to Node for this script.
// Ignore only that exact separator; every other unknown flag still fails shut.
const argumentsSet = new Set(process.argv.slice(2).filter((argument) => argument !== "--"));
const supportedArguments = new Set(["--allow-settlement-submit", "--help"]);
const unknownArguments = [...argumentsSet].filter((argument) => !supportedArguments.has(argument));
if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}
if (argumentsSet.has("--help")) {
  process.stdout.write(
    "Usage: node scripts/bootstrap-mcp-token.mjs [--allow-settlement-submit]\n\n" +
      "The default token can read and prepare settlements but cannot broadcast.\n" +
      "Pass --allow-settlement-submit only for a client that must perform the value-moving tool.\n",
  );
  process.exit(0);
}

if (!gitignore.split(/\r?\n/).some((line) => line.trim() === "proof-output/")) {
  throw new Error("Refusing to create a token: proof-output/ is not explicitly gitignored.");
}

const scopes = [
  "tabs:read",
  "settlements:prepare",
  "settlements:read",
];
const settlementSubmitEnabled = argumentsSet.has("--allow-settlement-submit");
if (settlementSubmitEnabled) scopes.push("settlements:submit");
const token = `ft_${randomBytes(32).toString("base64url")}`;
const tokenSha256 = createHash("sha256").update(token).digest("hex");
const createdAt = new Date().toISOString();

mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
try {
  // Exclusive create prevents an unnoticed token rotation. Move or delete the
  // existing local file deliberately before generating a replacement.
  writeFileSync(
    outputPath,
    `${JSON.stringify({ version: 1, createdAt, token }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
    throw new Error(`Refusing to overwrite existing ${relativeOutputPath}.`);
  }
  throw error;
}

const tokenConfig = {
  name: "finaltab-mcp-client",
  subject: "finaltab-mcp-client",
  tokenSha256,
  scopes,
};

// Deliberately print metadata only. The one-time raw token exists solely in
// the gitignored local file named below and never crosses stdout/stderr.
process.stdout.write(`${JSON.stringify({
  created: relativeOutputPath,
  tokenPrefix: "ft_",
  tokenSha256,
  finaltabApiTokensJson: JSON.stringify([tokenConfig]),
  clientTokenEnvironmentVariable: "FINALTAB_MCP_TOKEN",
  settlementSubmitEnabled,
  scopes,
}, null, 2)}\n`);
