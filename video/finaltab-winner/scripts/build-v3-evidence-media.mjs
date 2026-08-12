import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { invariant, parseArgs, readJson } from "./v3-tooling.mjs";
import { resolveMediaTools } from "./resolve-media-tools.mjs";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoDir = resolve(projectDir, "../..");
const sourceDir = join(projectDir, "assets", "capture-v3", "source");
const outputDir = join(projectDir, "assets", "capture-v3");
const args = parseArgs(process.argv.slice(2), ["only"]);
const supersededCaptureDigests = new Set(readJson(join(projectDir, "data", "superseded-v2-assets.json")).captureSha256);

const WIDTH = 2560;
const HEIGHT = 1440;
const FPS = 60;
const PROOF_WIDTH = 3840;
const PROOF_HEIGHT = 2160;

const colors = {
  ink: "#050706",
  panel: "#0A0F0D",
  panel2: "#101712",
  line: "#26332C",
  white: "#F4F8F1",
  muted: "#A5B0A7",
  acid: "#C8FF3D",
  blue: "#45AFFF",
  verified: "#B8FF5C",
  stop: "#FF7B74",
};

const screenshotContracts = {
  C05: {
    output: "C05-final-site-demo.mp4",
    durationSeconds: 20,
    minimumDurationSeconds: 18,
    header: "FINALTab / CANONICAL PRODUCTION PRODUCT",
    footer: "REAL CANONICAL PRODUCT SURFACES / CAPTURED 12 AUG 2026",
    files: [
      "landing-live.png",
      "app-home-live.png",
      "settlement-room-live.png",
      "durable-tab-live.png",
      "agents-memory-live.png",
      "proofs-live.png",
      "developers-live.png",
      "open-source-live.png",
    ],
  },
  C06: {
    output: "C06-complex-agent-task.mp4",
    durationSeconds: 18,
    minimumDurationSeconds: 16,
    header: "FINALTab / REAL AGENT CONTROL CENTER",
    footer: "SEPARATE RETAINED PRODUCT RUN / NOT THE LIVE MCP RECEIPT",
    files: [
      "agent-run-detail-live.png",
      "agent-stages-live.png",
      "agent-proof-stage-live.png",
      "agent-balance-live.png",
      "agents-memory-live.png",
    ],
  },
};

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function splitHash(value) {
  const raw = String(value);
  const prefix = raw.startsWith("0x") ? "0x" : "";
  const body = prefix ? raw.slice(2) : raw;
  return [`${prefix}${body.slice(0, 32)}`, body.slice(32)];
}

function shaFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertInside(root, path, label) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  const rel = relative(resolvedRoot, resolvedPath);
  invariant(rel && rel !== ".." && !rel.startsWith(`..${sep}`), `${label} escapes ${resolvedRoot}`);
  return resolvedPath;
}

function pngDimensions(path) {
  const bytes = readFileSync(path);
  invariant(bytes.length >= 24 && bytes.subarray(1, 4).toString("ascii") === "PNG", `${relative(projectDir, path)} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function imageDataUrl(path) {
  const bytes = readFileSync(path);
  let mime;
  if (bytes.length >= 8 && bytes.subarray(1, 4).toString("ascii") === "PNG") mime = "image/png";
  else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = "image/jpeg";
  else if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") mime = "image/webp";
  else throw new Error(`${relative(projectDir, path)} is not a supported browser screenshot image`);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectDir,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  invariant(!result.error, `${label} could not start: ${result.error?.message ?? "unknown error"}`);
  invariant(result.status === 0, `${label} failed:\n${String(result.stderr || result.stdout).trim()}`);
  return String(result.stdout);
}

function probeVideo(path) {
  const { ffprobe } = resolveMediaTools();
  const payload = JSON.parse(run(ffprobe.path, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate,avg_frame_rate,pix_fmt",
    "-of", "json",
    path,
  ], `ffprobe ${relative(projectDir, path)}`));
  const stream = payload.streams?.find((item) => item.codec_type === "video");
  invariant(stream, `${relative(projectDir, path)} has no video stream`);
  const ratio = (value) => {
    const [numerator, denominator] = String(value ?? "0/1").split("/").map(Number);
    return denominator ? numerator / denominator : 0;
  };
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    fps: ratio(stream.avg_frame_rate || stream.r_frame_rate),
    durationSeconds: Number(payload.format?.duration),
    pixelFormat: stream.pix_fmt,
    bytes: statSync(path).size,
    sha256: shaFile(path),
  };
}

function verifyVideo(path, minimumDurationSeconds, expectedDurationSeconds) {
  const media = probeVideo(path);
  invariant(!supersededCaptureDigests.has(media.sha256), `${basename(path)} matches a superseded V2 capture hash`);
  invariant(media.width >= WIDTH && media.height >= HEIGHT, `${basename(path)} is below ${WIDTH}x${HEIGHT}`);
  invariant(Math.abs(media.fps - FPS) < 0.01, `${basename(path)} is not CFR ${FPS} fps`);
  invariant(media.durationSeconds >= minimumDurationSeconds, `${basename(path)} is shorter than ${minimumDurationSeconds}s`);
  invariant(Math.abs(media.durationSeconds - expectedDurationSeconds) <= (1 / FPS) + 0.002, `${basename(path)} duration ${media.durationSeconds}s does not match ${expectedDurationSeconds}s`);
  const { ffmpeg } = resolveMediaTools();
  run(ffmpeg.path, ["-v", "error", "-i", path, "-map", "0:v:0", "-f", "null", "-"], `full decode ${basename(path)}`);
  return media;
}

async function loadSharp() {
  try {
    const direct = await import("sharp");
    return direct.default;
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  }
  const pnpmDir = join(repoDir, "node_modules", ".pnpm");
  invariant(existsSync(pnpmDir), "Sharp is unavailable. Install the repository dependencies first.");
  const packageDir = readdirSync(pnpmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("sharp@"))
    .map((entry) => join(pnpmDir, entry.name, "node_modules", "sharp", "lib", "index.js"))
    .find((candidate) => existsSync(candidate));
  invariant(packageDir, "Sharp is unavailable in the repository dependency store.");
  return (await import(pathToFileURL(packageDir).href)).default;
}

function safeCleanupTemp(directory) {
  const resolvedTempRoot = realpathSync(tmpdir());
  const resolvedDirectory = realpathSync(directory);
  const rel = relative(resolvedTempRoot, resolvedDirectory);
  invariant(rel && rel !== ".." && !rel.startsWith(`..${sep}`), "Refusing to remove an unexpected temporary directory");
  rmSync(resolvedDirectory, { recursive: true, force: true });
}

function videoSlideSvg({ eyebrow, title, body, facts = [], step, accent = colors.blue, stop = false }) {
  const factRows = facts.map((fact, index) => `
    <g transform="translate(170 ${815 + index * 94})">
      <rect width="2220" height="72" rx="18" fill="${colors.panel2}" stroke="${colors.line}" stroke-width="2"/>
      <text x="28" y="47" font-family="Consolas, monospace" font-size="27" font-weight="700" fill="${colors.muted}">${xml(fact.label)}</text>
      <text x="2190" y="47" text-anchor="end" font-family="Consolas, monospace" font-size="29" font-weight="700" fill="${fact.color ?? colors.white}">${xml(fact.value)}</text>
    </g>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <radialGradient id="glow" cx="75%" cy="18%" r="85%"><stop offset="0" stop-color="${accent}" stop-opacity=".22"/><stop offset=".55" stop-color="${colors.ink}" stop-opacity="0"/></radialGradient>
    <pattern id="grid" width="96" height="96" patternUnits="userSpaceOnUse"><path d="M 96 0 L 0 0 0 96" fill="none" stroke="${colors.line}" stroke-opacity=".30" stroke-width="1"/></pattern>
  </defs>
  <rect width="2560" height="1440" fill="${colors.ink}"/>
  <rect width="2560" height="1440" fill="url(#grid)"/>
  <rect width="2560" height="1440" fill="url(#glow)"/>
  <rect x="98" y="92" width="2364" height="1256" rx="36" fill="${colors.panel}" stroke="${stop ? colors.stop : colors.line}" stroke-width="${stop ? 6 : 2}"/>
  <text x="170" y="180" font-family="Consolas, monospace" font-size="29" font-weight="700" letter-spacing="3" fill="${accent}">${xml(eyebrow)}</text>
  <text x="2390" y="180" text-anchor="end" font-family="Consolas, monospace" font-size="27" font-weight="700" fill="${colors.muted}">${xml(step)}</text>
  <text x="170" y="338" font-family="Arial, sans-serif" font-size="92" font-weight="800" letter-spacing="-4" fill="${stop ? colors.stop : colors.white}">${xml(title)}</text>
  <text x="170" y="438" font-family="Arial, sans-serif" font-size="38" font-weight="600" fill="${colors.muted}">${xml(body)}</text>
  <line x1="170" y1="525" x2="2390" y2="525" stroke="${accent}" stroke-width="5"/>
  ${factRows}
  <rect x="98" y="1276" width="2364" height="72" fill="${stop ? colors.stop : colors.panel2}"/>
  <text x="170" y="1323" font-family="Consolas, monospace" font-size="27" font-weight="700" fill="${stop ? colors.ink : colors.stop}">HARD STOP / NO SIGNATURE / NO SUBMIT / NO BROADCAST / NO MONEY MOVED</text>
</svg>`;
}

function proofSvg(release) {
  const settlement = release.settlement;
  const [txA, txB] = splitHash(settlement.transactionHash);
  const [settlementA, settlementB] = splitHash(settlement.settlementId);
  const [ledgerA, ledgerB] = splitHash(settlement.ledgerHash);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PROOF_WIDTH}" height="${PROOF_HEIGHT}" viewBox="0 0 ${PROOF_WIDTH} ${PROOF_HEIGHT}">
  <defs>
    <radialGradient id="proof-glow" cx="78%" cy="20%" r="75%"><stop offset="0" stop-color="${colors.verified}" stop-opacity=".20"/><stop offset=".62" stop-color="${colors.ink}" stop-opacity="0"/></radialGradient>
    <pattern id="proof-grid" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M 120 0 L 0 0 0 120" fill="none" stroke="${colors.line}" stroke-opacity=".34" stroke-width="2"/></pattern>
  </defs>
  <rect width="3840" height="2160" fill="${colors.ink}"/>
  <rect width="3840" height="2160" fill="url(#proof-grid)"/>
  <rect width="3840" height="2160" fill="url(#proof-glow)"/>
  <rect x="150" y="132" width="3540" height="1896" rx="44" fill="${colors.panel}" stroke="${colors.line}" stroke-width="3"/>
  <rect x="150" y="132" width="3540" height="116" fill="${colors.verified}"/>
  <text x="220" y="207" font-family="Consolas, monospace" font-size="37" font-weight="800" letter-spacing="4" fill="${colors.ink}">EARLIER AUTHORIZED RUN / READ ONLY / NOT CREATED BY THIS MCP TEST</text>
  <text x="238" y="402" font-family="Consolas, monospace" font-size="31" font-weight="700" letter-spacing="4" fill="${colors.blue}">BASE SEPOLIA / PUBLIC TEST NETWORK</text>
  <text x="238" y="540" font-family="Arial, sans-serif" font-size="112" font-weight="800" letter-spacing="-5" fill="${colors.white}">RETAINED PROOF.</text>
  <text x="238" y="650" font-family="Arial, sans-serif" font-size="74" font-weight="800" letter-spacing="-3" fill="${colors.verified}">VERIFIED SETTLED.</text>
  <rect x="238" y="770" width="2110" height="1040" rx="30" fill="${colors.panel2}" stroke="${colors.line}" stroke-width="3"/>
  <text x="310" y="875" font-family="Consolas, monospace" font-size="29" font-weight="700" fill="${colors.muted}">TRANSACTION HASH</text>
  <text x="310" y="950" font-family="Consolas, monospace" font-size="40" font-weight="700" fill="${colors.white}">${xml(txA)}</text>
  <text x="310" y="1010" font-family="Consolas, monospace" font-size="40" font-weight="700" fill="${colors.white}">${xml(txB)}</text>
  <line x1="310" y1="1068" x2="2275" y2="1068" stroke="${colors.line}" stroke-width="3"/>
  <text x="310" y="1148" font-family="Consolas, monospace" font-size="29" font-weight="700" fill="${colors.muted}">SETTLEMENT ID</text>
  <text x="310" y="1220" font-family="Consolas, monospace" font-size="36" font-weight="700" fill="${colors.white}">${xml(settlementA)}</text>
  <text x="310" y="1275" font-family="Consolas, monospace" font-size="36" font-weight="700" fill="${colors.white}">${xml(settlementB)}</text>
  <text x="310" y="1390" font-family="Consolas, monospace" font-size="29" font-weight="700" fill="${colors.muted}">LEDGER HASH</text>
  <text x="310" y="1462" font-family="Consolas, monospace" font-size="36" font-weight="700" fill="${colors.white}">${xml(ledgerA)}</text>
  <text x="310" y="1517" font-family="Consolas, monospace" font-size="36" font-weight="700" fill="${colors.white}">${xml(ledgerB)}</text>
  <line x1="310" y1="1580" x2="2275" y2="1580" stroke="${colors.line}" stroke-width="3"/>
  <text x="310" y="1662" font-family="Consolas, monospace" font-size="31" font-weight="700" fill="${colors.blue}">sepolia.basescan.org/tx/${xml(settlement.transactionHash)}</text>
  <rect x="2440" y="770" width="1170" height="1040" rx="30" fill="#071008" stroke="${colors.verified}" stroke-width="5"/>
  <text x="2520" y="875" font-family="Consolas, monospace" font-size="29" font-weight="700" letter-spacing="3" fill="${colors.verified}">INDEPENDENT CHECKS</text>
  <text x="2520" y="1025" font-family="Arial, sans-serif" font-size="53" font-weight="800" fill="${colors.white}">BLOCK</text>
  <text x="3520" y="1025" text-anchor="end" font-family="Consolas, monospace" font-size="54" font-weight="800" fill="${colors.verified}">${xml(settlement.blockNumber)}</text>
  <line x1="2520" y1="1090" x2="3520" y2="1090" stroke="${colors.line}" stroke-width="3"/>
  <text x="2520" y="1205" font-family="Arial, sans-serif" font-size="45" font-weight="800" fill="${colors.white}">KEEPERHUB</text>
  <text x="3520" y="1205" text-anchor="end" font-family="Consolas, monospace" font-size="39" font-weight="800" fill="${colors.verified}">COMPLETED</text>
  <line x1="2520" y1="1270" x2="3520" y2="1270" stroke="${colors.line}" stroke-width="3"/>
  <text x="2520" y="1385" font-family="Arial, sans-serif" font-size="45" font-weight="800" fill="${colors.white}">RPC EVENT</text>
  <text x="3520" y="1385" text-anchor="end" font-family="Consolas, monospace" font-size="39" font-weight="800" fill="${colors.verified}">MATCHED</text>
  <line x1="2520" y1="1450" x2="3520" y2="1450" stroke="${colors.line}" stroke-width="3"/>
  <text x="2520" y="1565" font-family="Arial, sans-serif" font-size="45" font-weight="800" fill="${colors.white}">RETAINED</text>
  <text x="3520" y="1565" text-anchor="end" font-family="Consolas, monospace" font-size="39" font-weight="800" fill="${colors.verified}">0 ATOMIC</text>
  <rect x="2520" y="1645" width="1000" height="92" rx="20" fill="${colors.verified}"/>
  <text x="3020" y="1707" text-anchor="middle" font-family="Consolas, monospace" font-size="37" font-weight="900" letter-spacing="3" fill="${colors.ink}">VERIFIED / SETTLED</text>
  <text x="238" y="1915" font-family="Consolas, monospace" font-size="31" font-weight="700" fill="${colors.muted}">SETTLEMENT VALUE: ${xml(settlement.amountDisplay)} / EARLIER AUTHORIZED TEST-NETWORK RUN</text>
  <text x="3602" y="1915" text-anchor="end" font-family="Consolas, monospace" font-size="31" font-weight="700" fill="${colors.stop}">C07 DID NOT SIGN, SUBMIT, OR BROADCAST THIS</text>
</svg>`;
}

function validateReleaseProof(release) {
  invariant(release.network === "Base Sepolia" && release.chainId === 84532, "Retained proof must be Base Sepolia chain 84532");
  const settlement = release.settlement;
  invariant(settlement?.verdict === "VERIFIED_SETTLED", "Retained settlement is not VERIFIED_SETTLED");
  invariant(settlement.blockNumber === 45327128, "Retained settlement block does not match the locked release fact");
  invariant(/^0x[0-9a-f]{64}$/iu.test(settlement.transactionHash), "Retained transaction hash is malformed");
  invariant(/^0x[0-9a-f]{64}$/iu.test(settlement.settlementId), "Retained settlement ID is malformed");
  invariant(/^0x[0-9a-f]{64}$/iu.test(settlement.ledgerHash), "Retained ledger hash is malformed");
  invariant(settlement.keeperHubReceiptStatus === "success" && settlement.keeperHubTerminalState === "completed", "KeeperHub retained receipt is not terminal-success");
  invariant(settlement.independentRpcEventMatch === true, "Independent RPC event does not match");
  invariant(settlement.contractRetainedAtomic === "0" && settlement.conservationAtomic === "0", "Retained proof does not conserve atomic value");
  invariant(release.truthBoundary?.retainedRunOrigin?.includes("not an MCP submission"), "Retained-run origin separation is missing");
}

async function buildProof(sharp) {
  const release = readJson(join(projectDir, "data", "release-proof.json"));
  validateReleaseProof(release);
  const output = join(outputDir, "C08-retained-proof.png");
  mkdirSync(dirname(output), { recursive: true });
  await sharp(Buffer.from(proofSvg(release))).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(output);
  const dimensions = pngDimensions(output);
  invariant(dimensions.width === PROOF_WIDTH && dimensions.height === PROOF_HEIGHT, "C08 proof is not exact 4K UHD");
  const digest = shaFile(output);
  invariant(!supersededCaptureDigests.has(digest), "C08 unexpectedly matches a superseded V2 capture hash");
  return { id: "C08", path: relative(projectDir, output).replaceAll("\\", "/"), ...dimensions, bytes: statSync(output).size, sha256: digest };
}

function validateMcpTranscript(transcript) {
  invariant(transcript.schemaVersion === 1 && transcript.captureId === "C07", "C07 transcript schema is invalid");
  invariant(transcript.mode === "authenticated-nonbroadcast", "C07 transcript is not authenticated-nonbroadcast");
  invariant(transcript.credential?.copiedToArtifact === false, "C07 transcript may not copy its credential");
  invariant(Array.isArray(transcript.events) && transcript.events.length === 6, "C07 transcript must contain exactly six ordered events");
  const operations = transcript.events.map((event) => event.operation);
  invariant(JSON.stringify(operations) === JSON.stringify([
    "initialize",
    "tools/list",
    "allocate_receipt",
    "prepare_receipt_settlement",
    "create_broadcast_approval_challenge",
    "HARD_STOP",
  ]), "C07 transcript operation order violates the non-broadcast contract");
  invariant(transcript.events[0].status === "passed" && transcript.events[0].facts?.authenticated === true, "C07 initialize is not authenticated");
  invariant(transcript.events[1].facts?.toolCount === 9 && transcript.events[1].facts?.tools?.length === 9, "C07 tools/list does not contain exactly nine tools");
  invariant(transcript.events[2].facts?.sumsToTotal === true, "C07 allocation does not sum to the receipt total");
  invariant(transcript.events[4].facts?.walletActionPerformed === false && transcript.events[4].facts?.broadcast === false, "C07 approval challenge crossed the wallet-action boundary");
  const stop = transcript.events[5].facts;
  for (const key of ["walletApprovalRequested", "walletApprovalPerformed", "simulationPerformed", "submissionPerformed", "broadcastPerformed", "valueMoved"]) {
    invariant(stop?.[key] === false, `C07 hard stop requires ${key}=false`);
  }
  invariant(transcript.terminalBoundary === "approval-challenge-created-no-wallet-action", "C07 terminal boundary is invalid");
  invariant(transcript.retainedProofLane?.separate === true && transcript.retainedProofLane?.readOnly === true && transcript.retainedProofLane?.queriedByThisUtility === false, "C07 retained proof lane is not separate read-only evidence");
}

function mcpSlides(transcript) {
  const events = Object.fromEntries(transcript.events.map((event) => [event.operation, event]));
  const tools = events["tools/list"].facts.tools;
  return [
    videoSlideSvg({ eyebrow: "C07 / MCP TOOL CONNECTION", title: "AUTHENTICATED. BOUNDED.", body: "A named client connects to the canonical production endpoint.", step: "01 / 06", facts: [
      { label: "SERVER", value: `${events.initialize.facts.server} ${events.initialize.facts.version}` },
      { label: "AUTHENTICATED", value: "TRUE", color: colors.verified },
      { label: "CLIENT", value: transcript.client },
    ] }),
    videoSlideSvg({ eyebrow: "C07 / TOOLS LIST", title: "EXACTLY NINE TOOLS.", body: "The live surface is listed before any receipt work begins.", step: "02 / 06", facts: [
      { label: "COUNT", value: String(tools.length), color: colors.verified },
      { label: "ALLOCATION", value: tools.filter((name) => name.includes("split") || name.includes("allocate") || name.includes("net_")).join(" / ") },
      { label: "SETTLEMENT", value: "prepare / simulate / challenge / submit / status" },
    ] }),
    videoSlideSvg({ eyebrow: "C07 / DETERMINISTIC ALLOCATION", title: "RECEIPT ALLOCATED.", body: "The same complex receipt is checked without touching a wallet.", step: "03 / 06", facts: [
      { label: "RECEIPT", value: transcript.receipt.id },
      { label: "LINES / PEOPLE", value: `${transcript.receipt.lineCount} / ${transcript.receipt.participantCount}` },
      { label: "TOTAL", value: `${transcript.receipt.currency} ${transcript.receipt.total}`, color: colors.acid },
      { label: "SUMS TO TOTAL", value: "TRUE", color: colors.verified },
    ] }),
    videoSlideSvg({ eyebrow: "C07 / PREPARE ONLY", title: "WALLET WORK PREPARED.", body: "A request is constructed; no signature or simulation is performed.", step: "04 / 06", facts: [
      { label: "NETWORK", value: `BASE SEPOLIA / CHAIN ${events.prepare_receipt_settlement.facts.chainId}` },
      { label: "DEBITS / PAYOUTS", value: `${events.prepare_receipt_settlement.facts.debitCount} / ${events.prepare_receipt_settlement.facts.payoutCount}` },
      { label: "EXTERNAL WALLET REQUESTS", value: String(events.prepare_receipt_settlement.facts.externalWalletRequestCount) },
    ] }),
    videoSlideSvg({ eyebrow: "C07 / APPROVAL BOUNDARY", title: "CHALLENGE CREATED.", body: "The client reaches the explicit boundary and performs no wallet action.", step: "05 / 06", facts: [
      { label: "CHALLENGE", value: "CREATED", color: colors.verified },
      { label: "WALLET ACTION", value: "FALSE", color: colors.stop },
      { label: "BROADCAST", value: "FALSE", color: colors.stop },
      { label: "CHALLENGE PAYLOAD RETAINED", value: "FALSE" },
    ] }),
    videoSlideSvg({ eyebrow: "C07 / ENFORCED TERMINAL BOUNDARY", title: "HARD STOP.", body: "The test ends before wallet approval, signing, submission, or broadcast.", step: "06 / 06", accent: colors.stop, stop: true, facts: [
      { label: "NEXT OPERATION", value: "NONE", color: colors.stop },
      { label: "SIMULATION / SUBMISSION / BROADCAST", value: "FALSE / FALSE / FALSE", color: colors.stop },
      { label: "VALUE MOVED", value: "FALSE", color: colors.stop },
      { label: "EARLIER AUTHORIZED RUN", value: "SEPARATE / READ ONLY / NOT CREATED HERE", color: colors.verified },
    ] }),
  ];
}

async function renderSlidesToVideo(sharp, slides, outputPath, durationSeconds) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporary = mkdtempSync(join(tmpdir(), "finaltab-v3-evidence-"));
  try {
    const slidePaths = [];
    for (let index = 0; index < slides.length; index += 1) {
      const path = join(temporary, `slide-${String(index + 1).padStart(2, "0")}.png`);
      await sharp(Buffer.from(slides[index])).png({ compressionLevel: 8, adaptiveFiltering: true }).toFile(path);
      slidePaths.push(path);
    }
    const frameCounts = slidePaths.map((_, index) => {
      const base = Math.floor((durationSeconds * FPS) / slidePaths.length);
      return index === slidePaths.length - 1 ? (durationSeconds * FPS) - base * (slidePaths.length - 1) : base;
    });
    const commandArgs = [];
    for (let index = 0; index < slidePaths.length; index += 1) {
      commandArgs.push("-loop", "1", "-framerate", String(FPS), "-t", String(frameCounts[index] / FPS), "-i", slidePaths[index]);
    }
    const filters = slidePaths.map((_, index) => `[${index}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=${colors.ink},setsar=1,fps=${FPS},trim=end_frame=${frameCounts[index]},setpts=PTS-STARTPTS[v${index}]`);
    filters.push(`${slidePaths.map((_, index) => `[v${index}]`).join("")}concat=n=${slidePaths.length}:v=1:a=0,format=yuv420p[outv]`);
    commandArgs.push(
      "-filter_complex", filters.join(";"),
      "-map", "[outv]",
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-fps_mode", "cfr",
      "-movflags", "+faststart",
      "-t", String(durationSeconds),
      "-y",
      outputPath,
    );
    const { ffmpeg } = resolveMediaTools();
    run(ffmpeg.path, commandArgs, `render ${basename(outputPath)}`);
  } finally {
    safeCleanupTemp(temporary);
  }
}

async function buildMcp(sharp) {
  const transcriptPath = join(outputDir, "C07-mcp-sanitized-transcript.json");
  invariant(existsSync(transcriptPath), "C07 sanitized transcript is missing");
  const transcript = readJson(transcriptPath);
  validateMcpTranscript(transcript);
  const output = join(outputDir, "C07-mcp-nonbroadcast.mp4");
  await renderSlidesToVideo(sharp, mcpSlides(transcript), output, 17);
  return { id: "C07", path: relative(projectDir, output).replaceAll("\\", "/"), ...verifyVideo(output, 15, 17) };
}

function screenshotSlideSvg({ imageDataUrl, header, footer, captureId, ordinal, total }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="2560" height="1440" fill="${colors.ink}"/>
  <rect x="88" y="84" width="2384" height="1272" rx="30" fill="${colors.panel}" stroke="${colors.line}" stroke-width="3"/>
  <rect x="88" y="84" width="2384" height="90" fill="${colors.panel2}"/>
  <circle cx="140" cy="129" r="13" fill="${colors.stop}"/><circle cx="183" cy="129" r="13" fill="${colors.acid}"/><circle cx="226" cy="129" r="13" fill="${colors.blue}"/>
  <text x="280" y="140" font-family="Consolas, monospace" font-size="28" font-weight="700" fill="${colors.muted}">${xml(header)}</text>
  <text x="2410" y="140" text-anchor="end" font-family="Consolas, monospace" font-size="27" font-weight="700" fill="${colors.acid}">${xml(captureId)} / ${String(ordinal).padStart(2, "0")} OF ${String(total).padStart(2, "0")}</text>
  <rect x="122" y="205" width="2316" height="1038" rx="18" fill="#000"/>
  <image href="${imageDataUrl}" x="122" y="205" width="2316" height="1038" preserveAspectRatio="xMidYMid meet"/>
  <rect x="122" y="1268" width="2316" height="52" rx="12" fill="${colors.panel2}"/>
  <text x="158" y="1304" font-family="Consolas, monospace" font-size="24" font-weight="700" fill="${colors.white}">${xml(footer)}</text>
  <text x="2402" y="1304" text-anchor="end" font-family="Consolas, monospace" font-size="24" font-weight="700" fill="${colors.blue}">finaltab.vercel.app</text>
</svg>`;
}

async function sourceScreenshotPaths(sharp, contract) {
  const paths = contract.files.map((file) => assertInside(sourceDir, join(sourceDir, file), file));
  for (const path of paths) {
    invariant(existsSync(path), `Missing required source screenshot: ${relative(projectDir, path).replaceAll("\\", "/")}`);
    invariant(!lstatSync(path).isSymbolicLink(), `Source screenshot may not be a symbolic link: ${basename(path)}`);
    const metadata = await sharp(path).metadata();
    const dimensions = { width: Number(metadata.width), height: Number(metadata.height) };
    invariant(dimensions.width >= 800 && dimensions.height >= 600, `${basename(path)} is below the 800x600 source minimum`);
  }
  invariant(new Set(paths.map(shaFile)).size === paths.length, "Every required source screenshot must have unique bytes");
  return paths;
}

async function buildScreenshotCapture(sharp, captureId) {
  const contract = screenshotContracts[captureId];
  invariant(contract, `Unknown screenshot capture ${captureId}`);
  const paths = await sourceScreenshotPaths(sharp, contract);
  const screenshotSlides = paths.map((path, index) => screenshotSlideSvg({
    imageDataUrl: imageDataUrl(path),
    header: contract.header,
    footer: contract.footer,
    captureId,
    ordinal: index + 1,
    total: paths.length,
  }));
  let slides = screenshotSlides;
  if (captureId === "C06") {
    const transcript = readJson(join(outputDir, "C07-mcp-sanitized-transcript.json"));
    validateMcpTranscript(transcript);
    const allocate = transcript.events.find((event) => event.operation === "allocate_receipt").facts;
    const challenge = transcript.events.find((event) => event.operation === "create_broadcast_approval_challenge").facts;
    slides = [
      videoSlideSvg({
        eyebrow: "C06 / LIVE MCP INPUT / THIS LANE ONLY",
        title: "COMPLEX RECEIPT, REAL FACTS.",
        body: "The sanitized live MCP run carries the dense receipt; product screenshots below are separate evidence.",
        step: "LIVE INPUT",
        facts: [
          { label: "RECEIPT", value: transcript.receipt.id },
          { label: "LINES / PEOPLE", value: `${transcript.receipt.lineCount} / ${transcript.receipt.participantCount}` },
          { label: "TOTAL", value: `${transcript.receipt.currency} ${transcript.receipt.total}`, color: colors.acid },
          { label: "ALLOCATION SUMS TO TOTAL", value: String(allocate.sumsToTotal).toUpperCase(), color: colors.verified },
        ],
      }),
      videoSlideSvg({
        eyebrow: "C06 / LIVE MCP INPUT / TRUTHFUL VOICE STATE",
        title: "TYPED INPUT. VOICE IDLE.",
        body: "No live voice event exists in this run, so no voice success is claimed.",
        step: "LIVE INPUT",
        facts: [
          { label: "VOICE EVENT", value: "NONE / IDLE", color: colors.stop },
          { label: "APPROVAL CHALLENGE", value: challenge.created ? "CREATED" : "NOT CREATED" },
          { label: "WALLET ACTION", value: String(challenge.walletActionPerformed).toUpperCase(), color: colors.stop },
          { label: "BROADCAST", value: String(challenge.broadcast).toUpperCase(), color: colors.stop },
        ],
      }),
      videoSlideSvg({
        eyebrow: "C06 / EVIDENCE-LANE SEPARATION",
        title: "SEPARATE PRODUCT RUN.",
        body: "The next screens prove the real four-stage control center and retained memory; they are not the live MCP receipt.",
        step: "READ-ONLY PRODUCT EVIDENCE",
        accent: colors.acid,
        facts: [
          { label: "SAME PRODUCT", value: "YES", color: colors.verified },
          { label: "SAME RECEIPT / RUN", value: "NO", color: colors.stop },
          { label: "PURPOSE", value: "REAL STAGES / BALANCE / MEMORY" },
        ],
      }),
      ...screenshotSlides,
    ];
  }
  const output = join(outputDir, contract.output);
  await renderSlidesToVideo(sharp, slides, output, contract.durationSeconds);
  return { id: captureId, path: relative(projectDir, output).replaceAll("\\", "/"), sourceSha256: paths.map(shaFile), ...verifyVideo(output, contract.minimumDurationSeconds, contract.durationSeconds) };
}

function printHelp() {
  process.stdout.write(`FINALTab V3 evidence media composer (local files only)\n\n`);
  process.stdout.write(`  node scripts/build-v3-evidence-media.mjs --only C08\n`);
  process.stdout.write(`  node scripts/build-v3-evidence-media.mjs --only C07\n`);
  process.stdout.write(`  node scripts/build-v3-evidence-media.mjs --only C05\n`);
  process.stdout.write(`  node scripts/build-v3-evidence-media.mjs --only C06\n\n`);
  process.stdout.write(`C05/C06 fail closed until every specifically named genuine screenshot exists under assets/capture-v3/source/.\n`);
  process.stdout.write(`This tool never opens a browser, calls a provider, authenticates, signs, submits, broadcasts, or moves value.\n`);
}

if (args.help) {
  printHelp();
  process.exit(0);
}

const selected = String(args.only ?? "all").toUpperCase();
invariant(["ALL", "C05", "C06", "C07", "C08"].includes(selected), "--only must be C05, C06, C07, C08, or omitted");
const sharp = await loadSharp();
const results = [];
if (selected === "ALL" || selected === "C08") results.push(await buildProof(sharp));
if (selected === "ALL" || selected === "C07") results.push(await buildMcp(sharp));
if (selected === "ALL" || selected === "C05") results.push(await buildScreenshotCapture(sharp, "C05"));
if (selected === "ALL" || selected === "C06") results.push(await buildScreenshotCapture(sharp, "C06"));

process.stdout.write(`${JSON.stringify({
  status: "generated-local-evidence-media",
  safetyBoundary: "no browser, network, provider, wallet, signature, submit, broadcast, or value action",
  promotion: "pending independent review; no capture attestation or lock was changed",
  results,
}, null, 2)}\n`);
