import { lstatSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  invariant,
  parseArgs,
  readJson,
  resolveInside,
  sha256,
  writeJsonAtomic,
} from "./scripts/v3-tooling.mjs";
import { resolveMediaTools } from "./scripts/resolve-media-tools.mjs";

const projectDir = dirname(fileURLToPath(import.meta.url));
const pathFor = (relativePath) => join(projectDir, ...relativePath.split("/"));
const args = parseArgs(process.argv.slice(2), ["attestations", "init-attestations"]);
const contracts = readJson(pathFor("data/capture-contracts.json"));
const superseded = readJson(pathFor("data/superseded-v2-assets.json"));
const lockPath = pathFor("data/capture-lock.json");
const releasePath = pathFor("data/release-proof.json");

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", windowsHide: true });
  invariant(!result.error, `${label} could not start: ${result.error?.message ?? "unknown error"}`);
  invariant(result.status === 0, `${label} failed: ${(result.stderr || result.stdout || "").trim()}`);
  return result.stdout;
}

function probeVideo(path) {
  const { ffprobe } = resolveMediaTools();
  const payload = JSON.parse(run(ffprobe.path, [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate",
    "-of", "json", path,
  ], `ffprobe ${relative(projectDir, path)}`));
  const stream = payload.streams?.find((item) => item.codec_type === "video");
  invariant(stream, `${relative(projectDir, path)} has no video stream`);
  const [numerator, denominator] = String(stream.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    fps: denominator ? numerator / denominator : 0,
    durationSeconds: Number(payload.format?.duration),
  };
}

function pngDimensions(path) {
  const bytes = readFileSync(path);
  invariant(bytes.length >= 24 && bytes.subarray(1, 4).toString("ascii") === "PNG", `${relative(projectDir, path)} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function attest(contract, record) {
  invariant(record && record.id === contract.id, `Missing independent review for ${contract.id}`);
  invariant(record.inspectedBy && typeof record.inspectedBy === "string", `${contract.id} requires inspectedBy`);
  invariant(record.reviewerType === "independent-automated-visual-and-source-audit", `${contract.id} requires the exact independent reviewerType`);
  invariant(record.inspectedAt && !Number.isNaN(Date.parse(record.inspectedAt)), `${contract.id} requires an ISO inspectedAt time`);
  invariant(record.sourceMatches === true, `${contract.id} source was not attested`);
  invariant(record.noSecretsOrPrivateIdentity === true, `${contract.id} privacy/safety was not attested`);
  invariant(record.noValueMovement === true, `${contract.id} value-movement hard stop was not attested`);
  for (const statement of contract.required) {
    invariant(record.required?.[statement] === true, `${contract.id} required evidence is not attested: ${statement}`);
  }
  for (const statement of contract.forbidden) {
    invariant(record.forbiddenAbsent?.[statement] === true, `${contract.id} forbidden evidence absence is not attested: ${statement}`);
  }
}

invariant(contracts.schemaVersion === 3 && contracts.status === "locked-v3-truth-contracts", "V3 capture truth contracts are not locked");
invariant(contracts.captures.length === 4, "Exactly four V3 capture contracts are required");
invariant(new Set(contracts.captures.map((item) => item.id)).size === 4, "V3 capture IDs must be unique");
for (const contract of contracts.captures) resolveInside(projectDir, contract.path, `${contract.id} path`);

if (args["init-attestations"]) {
  const destination = resolveInside(projectDir, args["init-attestations"], "attestation output path");
  invariant(!statSync(destination, { throwIfNoEntry: false }), `Refusing to overwrite existing attestation file: ${relative(projectDir, destination)}`);
  writeJsonAtomic(destination, {
    schemaVersion: 3,
    status: "pending-independent-review",
    captures: contracts.captures.map((contract) => ({
      id: contract.id,
      inspectedBy: "",
      reviewerType: "independent-automated-visual-and-source-audit",
      inspectedAt: null,
      sourceMatches: false,
      noSecretsOrPrivateIdentity: false,
      noValueMovement: false,
      required: Object.fromEntries(contract.required.map((statement) => [statement, false])),
      forbiddenAbsent: Object.fromEntries(contract.forbidden.map((statement) => [statement, false])),
      notes: "",
    })),
  });
  process.stdout.write(`WROTE PENDING CAPTURE REVIEW · ${relative(projectDir, destination)} · no artifacts promoted\n`);
  process.exit(0);
}

if (!args.promote) {
  process.stdout.write("CAPTURE PROMOTER CONTRACT PASSED · local artifact inspection only · no browser, network, MCP, wallet, or value action\n");
  process.exit(0);
}

invariant(args.attestations, "Promotion requires --attestations <review.json>");
const attestationPath = resolveInside(projectDir, args.attestations, "attestations path");
const attestationPayload = readJson(attestationPath);
invariant(attestationPayload.schemaVersion === 3 && attestationPayload.status === "approved-independent-review", "Attestations must be schemaVersion 3 with status approved-independent-review");
invariant(Array.isArray(attestationPayload.captures) && attestationPayload.captures.length === 4, "Attestations must cover exactly four captures");
const attestations = new Map(attestationPayload.captures.map((item) => [item.id, item]));
invariant(attestations.size === 4, "Attestation capture IDs must be unique");
const denied = new Set(superseded.captureSha256);
const promoted = [];

for (const contract of contracts.captures) {
  const absolute = resolveInside(projectDir, contract.path, `${contract.id} path`);
  invariant(!lstatSync(absolute, { throwIfNoEntry: false })?.isSymbolicLink(), `${contract.id} artifact must not be a symbolic link`);
  const stat = statSync(absolute, { throwIfNoEntry: false });
  invariant(stat?.isFile() && stat.size > 0, `${contract.id} artifact is missing or empty: ${contract.path}`);
  const bytes = readFileSync(absolute);
  const digest = sha256(bytes);
  invariant(!denied.has(digest), `${contract.id} matches a superseded V2 capture hash`);
  const media = contract.kind === "still" ? pngDimensions(absolute) : probeVideo(absolute);
  if (contract.kind === "still") {
    invariant(media.width >= contracts.global.minimumStill.width && media.height >= contracts.global.minimumStill.height, `${contract.id} still is below minimum resolution`);
  } else {
    invariant(media.width >= contracts.global.minimumVideo.width && media.height >= contracts.global.minimumVideo.height, `${contract.id} video is below minimum resolution`);
    invariant(media.fps >= contracts.global.minimumVideo.fps - 0.01, `${contract.id} video is below minimum frame rate`);
    invariant(media.durationSeconds >= contract.minimumDurationSeconds, `${contract.id} video is shorter than ${contract.minimumDurationSeconds}s`);
  }
  attest(contract, attestations.get(contract.id));
  promoted.push({ id: contract.id, path: contract.path, kind: contract.kind, bytes: stat.size, sha256: digest, media });
}

const approvedAt = new Date().toISOString();
writeJsonAtomic(lockPath, {
  schemaVersion: 3,
  status: "approved-v3-captures",
  approvedAt,
  attestationPath: relative(projectDir, attestationPath).replaceAll("\\", "/"),
  attestationSha256: sha256(readFileSync(attestationPath)),
  captures: promoted,
});
const release = readJson(releasePath);
release.v3Film.productCaptureComplete = true;
release.v3Film.complexAgentCaptureComplete = true;
release.v3Film.mcpNonBroadcastCaptureComplete = true;
release.v3Film.retainedProofCaptureComplete = true;
writeJsonAtomic(releasePath, release);
process.stdout.write(`CAPTURE PROMOTION COMPLETE · ${promoted.length} locally inspected and independently reviewed artifacts · ${approvedAt}\n`);
