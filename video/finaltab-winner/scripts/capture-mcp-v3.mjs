import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CaptureSafetyError,
  createHttpTransport,
  loadCredential,
  runMcpCapture,
  writeCaptureArtifacts,
} from "./mcp-capture-v3-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(projectDir, "../..");
const credentialPath = path.join(repoDir, "proof-output", "finaltab-mcp-token.local.json");
const inputPath = path.join(projectDir, "data", "mcp-v3-complex-input.json");
const transcriptPath = path.join(projectDir, "assets", "capture-v3", "C07-mcp-sanitized-transcript.json");
const lockPath = path.join(projectDir, "data", "C07-mcp-capture-lock.json");

const args = new Set(process.argv.slice(2));
const known = new Set(["--live", "--force"]);

async function main() {
  if ([...args].some((arg) => !known.has(arg))) throw new CaptureSafetyError("UNKNOWN_ARGUMENT");
  if (!args.has("--live")) throw new CaptureSafetyError("LIVE_FLAG_REQUIRED_NO_REQUEST_MADE");

  const input = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(inputPath, "utf8")));
  const credential = await loadCredential(credentialPath);
  const transport = createHttpTransport({ credential: credential.token });
  const transcript = await runMcpCapture({ transport, input });
  await writeCaptureArtifacts({
    transcript,
    transcriptPath,
    lockPath,
    force: args.has("--force"),
    credential: credential.token,
  });
  process.stdout.write([
    "C07 MCP capture completed with the approval-challenge hard stop enforced.",
    `sanitized transcript: ${path.relative(projectDir, transcriptPath)}`,
    `lock metadata: ${path.relative(projectDir, lockPath)}`,
    "No wallet signature, simulation, submission, broadcast, value movement, retained-run query, credential copy, or raw response artifact was produced.",
  ].join("\n") + "\n");
}

main().catch((error) => {
  const code = error instanceof CaptureSafetyError ? error.code : "CAPTURE_FAILED_CLOSED";
  process.stderr.write(`C07 MCP capture stopped safely: ${code}. No raw response or credential was printed.\n`);
  process.exitCode = 1;
});
