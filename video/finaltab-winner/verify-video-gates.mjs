import { access, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const allowPlaceholders = process.argv.includes("--allow-placeholders");
const expected = {
  duration: 96,
  width: 3840,
  height: 2160,
  fps: 60,
  chainId: 84532,
  executionId: "3hmlqi36zweiwg6fc5o2u",
  transactionHash: "0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789",
  blockNumber: 45327128,
  settlementId: "0x8b670800d9856a90baa7492adefaf06ae86ac345d053db3dc7f01b065aadb9db",
  ledgerHash: "0x1581eb7f56485ff4d2a684a832fc8d085b9b0e5d8540c85e2d550e8f7b0cb91e",
  amountAtomic: "1",
  productionTools: [
    "split_equal",
    "split_weighted",
    "net_debts",
    "allocate_receipt",
    "prepare_receipt_settlement",
    "simulate_signed_settlement",
    "create_broadcast_approval_challenge",
    "submit_signed_settlement",
    "settlement_status",
  ],
};

function invariant(value, message) {
  if (!value) throw new Error(message);
}

const proof = JSON.parse(await readFile(join(projectDir, "data", "release-proof.json"), "utf8"));
const index = await readFile(join(projectDir, "index.html"), "utf8");
const packageJson = JSON.parse(await readFile(join(projectDir, "package.json"), "utf8"));
const allFrameFiles = [
  "01-outcome-lockup.html",
  "02-architecture-rail.html",
  "03-complex-product-flow.html",
  "04-net-freeze-bind.html",
  "05-dual-consent-simulate.html",
  "06-keeperhub-proof.html",
  "07-nine-mcp-tools.html",
  "08-mcp-climax.html",
  "09-proof-cta.html",
];
const frameSources = new Map(await Promise.all(allFrameFiles.map(async (file) => [
  file,
  await readFile(join(projectDir, "compositions", "frames", file), "utf8"),
])));
const slotFiles = [
  "C03-complex-product-flow.svg",
  "C04-net-freeze-bind.svg",
  "C05-dual-consent-simulate.svg",
  "C06-keeperhub-proof.svg",
  "C07-developer-mcp-surface.svg",
  "C08-real-mcp-v2-run.svg",
];
const slotSources = await Promise.all(slotFiles.map((file) => readFile(join(projectDir, "assets", "capture-slots", file), "utf8")));

invariant(index.includes(`data-duration="${expected.duration}"`), "Root duration is not 96 seconds");
invariant(index.includes(`<meta name="viewport" content="width=${expected.width}, height=${expected.height}"/>`), "Viewport is not native 4K");
invariant(index.includes(`data-width="${expected.width}" data-height="${expected.height}" data-fps="${expected.fps}"`), "Root composition is not 3840x2160 at 60 fps");
const nativeDimensions = `data-width="${expected.width}" data-height="${expected.height}"`;
invariant(index.split(nativeDimensions).length - 1 === 10, "The root plus all nine frame hosts must declare native 4K dimensions");
for (const [file, source] of frameSources) {
  invariant(source.includes(`data-width="${expected.width}" data-height="${expected.height}"`), `${file} is not a native 4K sub-composition`);
  invariant(source.includes("#root{position:absolute;inset:0;width:3840px;height:2160px"), `${file} root CSS is not native 4K`);
  invariant(source.includes(".scene{width:50%;height:50%;transform:scale(2);transform-origin:0 0"), `${file} is missing the deterministic native-4K scene transform`);
}
for (const [indexValue, source] of slotSources.entries()) {
  invariant(source.includes(`width="3200" height="1520"`), `${slotFiles[indexValue]} is not a 2x vector capture plate`);
}
const finalRenderCommand = packageJson.scripts?.["render:final"] ?? "";
invariant(finalRenderCommand.includes("--fps 60") && finalRenderCommand.includes("--resolution landscape-4k"), "Final render script is not locked to 4K at 60 fps");

const frameSeven = frameSources.get("07-nine-mcp-tools.html");
const displayedTools = [...frameSeven.matchAll(/<code>([^<]+)<\/code>/gu)].map((match) => match[1]);
invariant(JSON.stringify(displayedTools) === JSON.stringify(expected.productionTools), "Frame 7 must display exactly the nine production MCP tools in canonical order");
invariant(proof.currentSource?.productionMcpTools === expected.productionTools.length, "Release proof does not declare exactly nine production MCP tools");
invariant(proof.currentSource?.retiredFixedWalletTools === 0, "Release proof still declares a retired fixed-wallet tool");
invariant(proof.currentSource?.walletModel === "external debtor wallets", "Release proof wallet model is not external-debtor-wallet signing");
invariant(proof.currentSource?.firstPartyFreezeReviewStages === 4, "Release proof does not declare the four-stage Freeze review");

const frameFour = frameSources.get("04-net-freeze-bind.html");
for (const phrase of ["ATTESTED AGENT REVIEW", "EXTRACTION", "ALLOCATION", "CONSENT", "PROOF PREFLIGHT", "SKIPPED BEFORE SUBMISSION", "REVIEW INVALIDATED", "FRESH ATTESTED RUN REQUIRED"]) {
  invariant(frameFour.includes(phrase), `Frame 4 is missing the attested-review contract: ${phrase}`);
}
for (const [surface, source] of [
  ["C03 capture contract", slotSources[0]],
  ["Frame 5", frameSources.get("05-dual-consent-simulate.html")],
  ["Frame 7", frameSeven],
  ["Frame 8", frameSources.get("08-mcp-climax.html")],
]) {
  invariant(/external[- ]wallet/iu.test(source), `${surface} does not establish the external-wallet signing model`);
}

const visualSource = [index, ...frameSources.values(), ...slotSources].join("\n");
const retiredPrefix = "demo" + "_";
const retiredRoute = "/" + "lab";
const fixedIdentities = [
  String.fromCharCode(86, 101, 101),
  String.fromCharCode(72, 101, 109),
  String.fromCharCode(82, 97, 118, 105),
];
const fixedIdentityPattern = new RegExp(`\\b(?:${fixedIdentities.join("|")})\\b`, "iu");
invariant(!visualSource.toLowerCase().includes(retiredPrefix), "Visual source names a retired MCP tool");
invariant(!visualSource.toLowerCase().includes(retiredRoute), "Visual source links to the retired product route");
invariant(!fixedIdentityPattern.test(visualSource), "Visual source contains a fixed participant identity");
for (const legacyDimension of [String(expected.width / 2), String(expected.height / 2)]) {
  invariant(!visualSource.includes(legacyDimension), `Visual source contains a legacy dimension: ${legacyDimension}`);
}

invariant(proof.chainId === expected.chainId, "Release proof chain is not Base Sepolia 84532");
for (const field of ["executionId", "transactionHash", "blockNumber", "settlementId", "ledgerHash", "amountAtomic"]) {
  invariant(proof.settlement[field] === expected[field], `Release proof mismatch: settlement.${field}`);
}
invariant(proof.settlement.pullCount === 1 && proof.settlement.payoutCount === 1, "Release proof is not the exact one-pull / one-payout run");
invariant(proof.settlement.verdict === "VERIFIED_SETTLED" && proof.settlement.independentRpcEventMatch === true, "Release proof is not independently verified");
invariant(proof.settlement.executionId !== proof.deployment.executionId, "Settlement execution reuses deployment execution");
invariant(proof.settlement.transactionHash !== proof.deployment.transactionHash, "Settlement transaction reuses deployment transaction");

const voiceManifest = JSON.parse(await readFile(join(projectDir, "data", "voiceover-manifest.json"), "utf8"));
invariant(Array.isArray(voiceManifest.scenes) && voiceManifest.scenes.length === 9, "Voiceover manifest must contain nine scenes");
const finalNarrationApproved = voiceManifest.status === "approved-final-capture-sync" && voiceManifest.regenerateAfterApprovedCaptures === false;
for (let scene = 1; scene <= 9; scene += 1) {
  const file = join(projectDir, "assets", "audio", "voice", `scene-${String(scene).padStart(2, "0")}.mp3`);
  await access(file);
  invariant((await stat(file)).size > 20_000, `Voiceover scene ${scene} is empty or truncated`);
}

const captureTargets = [
  "assets/capture/C03-complex-product-flow.mp4",
  "assets/capture/C04-net-freeze-bind.mp4",
  "assets/capture/C05-dual-consent-simulate.mp4",
  "assets/capture/C06-v2-keeperhub-proof.mp4",
  "assets/capture/C06-v2-proof-capsule.png",
  "assets/capture/C07-developer-mcp-surface.png",
  "assets/capture/C08-real-mcp-v2-run.mp4",
];
const missingCaptures = [];
for (const relative of captureTargets) {
  try {
    const item = await stat(join(projectDir, ...relative.split("/")));
    if (item.size === 0) missingCaptures.push(relative);
  } catch {
    missingCaptures.push(relative);
  }
}

const frameFiles = [
  "03-complex-product-flow.html",
  "04-net-freeze-bind.html",
  "05-dual-consent-simulate.html",
  "06-keeperhub-proof.html",
  "07-nine-mcp-tools.html",
  "08-mcp-climax.html",
];
const slotReferences = [];
for (const frame of frameFiles) {
  const source = frameSources.get(frame);
  if (/CAPTURE SLOT|capture-slots\//u.test(source)) slotReferences.push(frame);
}

const truth = proof.truthBoundary ?? {};
const unresolvedTruth = [
  ["productCaptureComplete", truth.productCaptureComplete],
  ["liveMcpToolListCaptureComplete", truth.liveMcpToolListCaptureComplete],
  ["sameRunMcpClientCaptureComplete", truth.sameRunMcpClientCaptureComplete],
].filter(([, value]) => value !== true).map(([key]) => key);

if (!allowPlaceholders) {
  invariant(missingCaptures.length === 0, `Final render blocked: missing captures: ${missingCaptures.join(", ")}`);
  invariant(slotReferences.length === 0, `Final render blocked: placeholder source remains in: ${slotReferences.join(", ")}`);
  invariant(unresolvedTruth.length === 0, `Final render blocked: unresolved truth gates: ${unresolvedTruth.join(", ")}`);
  invariant(finalNarrationApproved, "Final render blocked: narration/captions are a provisional script pass and must be regenerated after approved captures");
  process.stdout.write("FINAL RENDER GATE PASSED\n");
} else {
  process.stdout.write(`SOURCE GATE PASSED · final render intentionally blocked by ${missingCaptures.length} capture files, ${slotReferences.length} slot-bearing frames, ${unresolvedTruth.length} truth flags, and provisional narration/captions\n`);
}
