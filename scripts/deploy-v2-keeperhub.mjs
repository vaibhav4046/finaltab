#!/usr/bin/env node
/**
 * Deploy FinalTabBatchSettlementV2 through KeeperHub -> Base Sepolia CreateX.
 *
 * Safety properties:
 * - Requires the compiled V2 artifact; the V1 artifact is never referenced.
 * - Simulates the exact CreateX call before any broadcast.
 * - Uses a stable idempotency key derived from the V2 init-code hash.
 * - Treats KeeperHub success as unproven until its verified receipt is checked
 *   again through an independent Base Sepolia RPC.
 * - Parses CreateX's ContractCreation(address) event, compares runtime code
 *   against the compiled template outside immutable slots, then checks the
 *   USDC immutable and EIP-712 domain through eth_call.
 * - Submits the exact Hardhat standard-json input to Sourcify API V2.
 *
 * The KeeperHub key is loaded into memory from KEEPERHUB_API_KEY or an explicit
 * --env-file. It is never printed or written to evidence.
 *
 * Usage:
 *   node scripts/deploy-v2-keeperhub.mjs --env-file <path>             # simulate only
 *   node scripts/deploy-v2-keeperhub.mjs --env-file <path> --broadcast # simulate + deploy
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../packages/keeperhub-flight-recorder/src/classify.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromWeb = createRequire(join(ROOT, "apps", "web", "package.json"));
const {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  toHex,
} = requireFromWeb("viem");

const CHAIN_ID = 84532;
const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const KEEPERHUB_BASE_URL = "https://app.keeperhub.com";
const SOURCIFY_BASE_URL = "https://sourcify.dev/server";
const USDC = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const CREATEX = getAddress("0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed");
const CONTRACT_NAME = "FinalTabBatchSettlementV2";
const SOURCE_NAME = "contracts/FinalTabBatchSettlementV2.sol";
const CONTRACT_IDENTIFIER = `${SOURCE_NAME}:${CONTRACT_NAME}`;
const ARTIFACT_DIR = join(ROOT, "contracts", "artifacts", "contracts", "FinalTabBatchSettlementV2.sol");
const ARTIFACT_PATH = join(ARTIFACT_DIR, `${CONTRACT_NAME}.json`);
const DEBUG_PATH = join(ARTIFACT_DIR, `${CONTRACT_NAME}.dbg.json`);
const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const CONTRACT_CREATION_TOPIC = keccak256(toHex("ContractCreation(address)"));

const CREATEX_ABI = [
  {
    type: "function",
    name: "deployCreate",
    stateMutability: "payable",
    inputs: [{ name: "initCode", type: "bytes" }],
    outputs: [{ name: "newContract", type: "address" }],
  },
];

function parseArgs(argv) {
  const args = {
    broadcast: false,
    buildOnly: false,
    envFile: null,
    keeperHubUrl: KEEPERHUB_BASE_URL,
    rpcUrl: BASE_SEPOLIA_RPC,
    sourcifyUrl: SOURCIFY_BASE_URL,
    timeoutMs: 300_000,
    verificationTimeoutMs: 240_000,
    outDir: join(ROOT, "proof-output"),
    evidenceDir: join(ROOT, "docs", "release", "evidence"),
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--broadcast") args.broadcast = true;
    else if (arg === "--build-only") args.buildOnly = true;
    else if (arg === "--env-file") args.envFile = argv[++i];
    else if (arg === "--keeperhub-url") args.keeperHubUrl = argv[++i];
    else if (arg === "--rpc-url") args.rpcUrl = argv[++i];
    else if (arg === "--sourcify-url") args.sourcifyUrl = argv[++i];
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (arg === "--verification-timeout-ms") args.verificationTimeoutMs = Number(argv[++i]);
    else if (arg === "--out-dir") args.outDir = resolve(argv[++i]);
    else if (arg === "--evidence-dir") args.evidenceDir = resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/deploy-v2-keeperhub.mjs [--env-file PATH] [--broadcast] " +
          "[--build-only] [--timeout-ms N] [--verification-timeout-ms N] " +
          "[--out-dir DIR] [--evidence-dir DIR]",
      );
      process.exitCode = 0;
      return null;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 10_000) {
    throw new Error("--timeout-ms must be at least 10000");
  }
  if (!Number.isFinite(args.verificationTimeoutMs) || args.verificationTimeoutMs < 10_000) {
    throw new Error("--verification-timeout-ms must be at least 10000");
  }
  if (args.buildOnly && args.broadcast) {
    throw new Error("--build-only and --broadcast are mutually exclusive");
  }
  return args;
}

function loadKeeperHubKey(envFile) {
  if (process.env.KEEPERHUB_API_KEY) {
    return { key: process.env.KEEPERHUB_API_KEY, source: "process-env" };
  }
  if (!envFile) throw new Error("KEEPERHUB_API_KEY is unset; pass --env-file explicitly");
  if (!existsSync(envFile)) throw new Error("The explicit --env-file does not exist");

  const raw = readFileSync(envFile, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?KEEPERHUB_API_KEY\s*=\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/);
    if (match) return { key: match[1], source: "env-file" };
  }
  throw new Error("KEEPERHUB_API_KEY is absent from the explicit --env-file");
}

function assertOrgKey(key) {
  if (typeof key !== "string" || !key.startsWith("kh_") || key.length < 8) {
    throw new Error("KeeperHub credential is not a kh_ organization key");
  }
}

function readBuildContext() {
  if (!existsSync(ARTIFACT_PATH) || !existsSync(DEBUG_PATH)) {
    throw new Error(`V2 artifact missing. Run pnpm --dir contracts build first.`);
  }
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  const debug = JSON.parse(readFileSync(DEBUG_PATH, "utf8"));
  if (artifact.contractName !== CONTRACT_NAME || artifact.sourceName !== SOURCE_NAME) {
    throw new Error(`Refusing unexpected artifact ${artifact.sourceName}:${artifact.contractName}`);
  }
  if (typeof artifact.bytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(artifact.bytecode)) {
    throw new Error("V2 creation bytecode is empty or malformed");
  }
  if (typeof artifact.deployedBytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(artifact.deployedBytecode)) {
    throw new Error("V2 runtime bytecode is empty or malformed");
  }

  const buildInfoPath = resolve(ARTIFACT_DIR, debug.buildInfo);
  if (!buildInfoPath.includes(resolve(ROOT, "contracts", "artifacts", "build-info"))) {
    throw new Error("Artifact debug file points outside Hardhat build-info");
  }
  const buildInfo = JSON.parse(readFileSync(buildInfoPath, "utf8"));
  const compiled = buildInfo.output?.contracts?.[SOURCE_NAME]?.[CONTRACT_NAME];
  if (!compiled) throw new Error(`Build info does not contain ${CONTRACT_IDENTIFIER}`);

  const compiledCreation = `0x${compiled.evm.bytecode.object}`.toLowerCase();
  const compiledRuntime = `0x${compiled.evm.deployedBytecode.object}`.toLowerCase();
  if (compiledCreation !== artifact.bytecode.toLowerCase()) {
    throw new Error("Artifact creation bytecode does not match its referenced build-info");
  }
  if (compiledRuntime !== artifact.deployedBytecode.toLowerCase()) {
    throw new Error("Artifact runtime bytecode does not match its referenced build-info");
  }

  const constructorArgs = encodeAbiParameters([{ type: "address" }], [USDC]);
  const initCode = `${artifact.bytecode}${constructorArgs.slice(2)}`;
  const immutableReferences = compiled.evm.deployedBytecode.immutableReferences ?? {};

  return {
    artifact,
    buildInfo,
    buildInfoPath,
    initCode,
    constructorArgs,
    immutableReferences,
    summary: {
      contract: CONTRACT_IDENTIFIER,
      protocolVersion: 2,
      compilerVersion: buildInfo.solcLongVersion,
      optimizer: buildInfo.input.settings.optimizer,
      evmVersion: buildInfo.input.settings.evmVersion ?? "default",
      creationBytecodeBytes: (artifact.bytecode.length - 2) / 2,
      runtimeBytecodeBytes: (artifact.deployedBytecode.length - 2) / 2,
      initCodeBytes: (initCode.length - 2) / 2,
      creationBytecodeHash: keccak256(artifact.bytecode),
      runtimeTemplateHash: keccak256(artifact.deployedBytecode),
      initCodeHash: keccak256(initCode),
      standardJsonInputHash: keccak256(toHex(JSON.stringify(buildInfo.input))),
      constructor: { usdc: USDC },
      immutableSlotCount: Object.values(immutableReferences).flat().length,
    },
  };
}

function stableUuid(seedHash) {
  const bytes = Buffer.from(seedHash.slice(2, 34), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function rpc(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${method} returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.error || body.result === undefined) {
    throw new Error(`RPC ${method} failed: ${body.error?.message ?? "missing result"}`);
  }
  return body.result;
}

async function keeperHubApi(baseUrl, apiKey, method, path, body, extraHeaders = {}) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: "KeeperHub returned a non-JSON response" };
  }
  return { status: response.status, json, headers: response.headers };
}

function keeperHubErrorSummary(body) {
  const value = body && typeof body === "object" ? body : {};
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    revertReason: typeof value.revertReason === "string" ? value.revertReason : undefined,
    balanceWei: typeof value.balanceWei === "string" ? value.balanceWei : undefined,
    requiredWei: typeof value.requiredWei === "string" ? value.requiredWei : undefined,
    shortfallWei: typeof value.shortfallWei === "string" ? value.shortfallWei : undefined,
    nativeSymbol: typeof value.nativeSymbol === "string" ? value.nativeSymbol : undefined,
  };
}

function sanitizeSimulation(body) {
  const value = body && typeof body === "object" ? body : {};
  return {
    success: value.success === true,
    wouldRevert: value.wouldRevert === true,
    sponsored: typeof value.sponsored === "boolean" ? value.sponsored : undefined,
    gasEstimate:
      typeof value.gasEstimate === "string" || typeof value.gasEstimate === "number"
        ? String(value.gasEstimate)
        : undefined,
    ...keeperHubErrorSummary(value),
  };
}

function sanitizeTerminal(terminal) {
  const receipts = Array.isArray(terminal?.receipts)
    ? terminal.receipts.map((receipt) => ({
        hash: receipt.hash,
        chainId: receipt.chainId,
        verified: receipt.verified,
        receiptStatus: receipt.receiptStatus,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        verifiedAt: receipt.verifiedAt,
      }))
    : [];
  return {
    executionId: terminal?.executionId,
    status: terminal?.status,
    sponsored: terminal?.sponsored,
    transactionHash: terminal?.transactionHash,
    transactionLink: terminal?.transactionLink,
    receipts,
    error: typeof terminal?.error === "string" ? terminal.error : null,
  };
}

async function pollKeeperHub(baseUrl, apiKey, executionId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let polls = 0;
  let last = null;
  while (Date.now() < deadline) {
    const response = await keeperHubApi(baseUrl, apiKey, "GET", `/api/execute/${executionId}/status`);
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "5");
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5) * 1000);
      continue;
    }
    if (response.status >= 400) {
      throw new Error(`KeeperHub status returned HTTP ${response.status}`);
    }
    polls++;
    last = response.json;
    const hintHeader = response.headers.get("X-Poll-Interval-Hint");
    const hint = hintHeader === null ? null : Number(hintHeader);
    if (TERMINAL.has(last?.status) || hint === 0) return { terminal: last, polls };
    await sleep((hint !== null && Number.isFinite(hint) && hint > 0 ? hint : 3) * 1000);
  }
  return { terminal: last, polls };
}

async function executeKeeperHub(baseUrl, apiKey, call, idempotencyKey) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await keeperHubApi(
      baseUrl,
      apiKey,
      "POST",
      "/api/execute/contract-call",
      call,
      { "Idempotency-Key": idempotencyKey },
    );
    const body = response.json ?? {};
    if (response.status === 409) {
      const code = body.code ?? body.error;
      if (code === "idempotency_in_progress") {
        await sleep(1000);
        continue;
      }
      if (code === "idempotency_conflict" && typeof body.originalExecutionId === "string") {
        return { executionId: body.originalExecutionId, idempotentReplay: true };
      }
      throw new Error(`KeeperHub execution conflict: ${code ?? "unknown"}`);
    }
    if (response.status >= 400) {
      const summary = keeperHubErrorSummary(body);
      throw new Error(`KeeperHub execution HTTP ${response.status}: ${summary.code ?? summary.message ?? summary.error ?? "unknown"}`);
    }
    const executionId =
      typeof body.executionId === "string"
        ? body.executionId
        : typeof body.execution?.id === "string"
          ? body.execution.id
          : null;
    if (!executionId) throw new Error("KeeperHub execution response omitted executionId");
    return { executionId, idempotentReplay: body.idempotentReplay === true };
  }
  throw new Error("KeeperHub idempotency remained in progress after retries");
}

function compareRuntime(compiledRuntime, onchainRuntime, immutableReferences) {
  const compiled = Buffer.from(compiledRuntime.slice(2), "hex");
  const onchain = Buffer.from(onchainRuntime.slice(2), "hex");
  if (compiled.length !== onchain.length) {
    return {
      matched: false,
      compiledBytes: compiled.length,
      onchainBytes: onchain.length,
      unmaskedMismatchCount: null,
    };
  }
  const ignored = new Uint8Array(compiled.length);
  for (const ranges of Object.values(immutableReferences)) {
    for (const range of ranges) {
      for (let i = range.start; i < range.start + range.length; i++) ignored[i] = 1;
    }
  }
  let mismatchCount = 0;
  for (let i = 0; i < compiled.length; i++) {
    if (!ignored[i] && compiled[i] !== onchain[i]) mismatchCount++;
  }
  return {
    matched: mismatchCount === 0,
    compiledBytes: compiled.length,
    onchainBytes: onchain.length,
    ignoredImmutableBytes: ignored.reduce((sum, value) => sum + value, 0),
    unmaskedMismatchCount: mismatchCount,
  };
}

async function readContract(rpcUrl, artifact, address, functionName) {
  const data = encodeFunctionData({ abi: artifact.abi, functionName });
  const result = await rpc(rpcUrl, "eth_call", [{ to: address, data }, "latest"]);
  return decodeFunctionResult({ abi: artifact.abi, functionName, data: result });
}

async function verifyDeploymentOnchain(args, context, txHash) {
  const receipt = await rpc(args.rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) throw new Error("Independent RPC has no deployment receipt");
  if (receipt.transactionHash?.toLowerCase() !== txHash.toLowerCase()) {
    throw new Error("Independent receipt transaction hash mismatch");
  }
  if (receipt.status !== "0x1") throw new Error(`Independent receipt status is ${receipt.status}`);

  const creationLogs = (receipt.logs ?? []).filter(
    (log) =>
      log.address?.toLowerCase() === CREATEX.toLowerCase() &&
      log.topics?.[0]?.toLowerCase() === CONTRACT_CREATION_TOPIC.toLowerCase() &&
      log.topics.length === 2,
  );
  if (creationLogs.length !== 1) {
    throw new Error(`Expected exactly one CreateX ContractCreation(address) event; found ${creationLogs.length}`);
  }
  const topic = creationLogs[0].topics[1];
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) throw new Error("Malformed ContractCreation address topic");
  const contractAddress = getAddress(`0x${topic.slice(-40)}`);

  const onchainCode = await rpc(args.rpcUrl, "eth_getCode", [contractAddress, "latest"]);
  if (onchainCode === "0x" || onchainCode === "0x0") throw new Error("Created address has no runtime code");
  const runtimeComparison = compareRuntime(
    context.artifact.deployedBytecode,
    onchainCode,
    context.immutableReferences,
  );
  if (!runtimeComparison.matched) {
    throw new Error(`Onchain runtime differs from V2 artifact in ${runtimeComparison.unmaskedMismatchCount} non-immutable bytes`);
  }

  const usdc = getAddress(await readContract(args.rpcUrl, context.artifact, contractAddress, "usdc"));
  if (usdc !== USDC) throw new Error(`V2 immutable USDC mismatch: ${usdc}`);

  const domainSeparator = await readContract(args.rpcUrl, context.artifact, contractAddress, "domainSeparator");
  const expectedDomainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
        keccak256(toHex("FINALTab Settlement")),
        keccak256(toHex("2")),
        BigInt(CHAIN_ID),
        contractAddress,
      ],
    ),
  );
  if (domainSeparator.toLowerCase() !== expectedDomainSeparator.toLowerCase()) {
    throw new Error("V2 EIP-712 domain separator mismatch");
  }

  const eip712Domain = await readContract(args.rpcUrl, context.artifact, contractAddress, "eip712Domain");
  const domainValues = Array.from(eip712Domain);
  const [, domainName, domainVersion, domainChainId, domainContract, domainSalt, extensions] = domainValues;
  if (
    domainName !== "FINALTab Settlement" ||
    domainVersion !== "2" ||
    BigInt(domainChainId) !== BigInt(CHAIN_ID) ||
    getAddress(domainContract) !== contractAddress ||
    domainSalt !== `0x${"00".repeat(32)}` ||
    !Array.isArray(extensions) ||
    extensions.length !== 0
  ) {
    throw new Error("V2 IERC-5267 domain fields do not match the expected domain");
  }

  const latestBlock = Number.parseInt(await rpc(args.rpcUrl, "eth_blockNumber", []), 16);
  const blockNumber = Number.parseInt(receipt.blockNumber, 16);
  const confirmations = Math.max(0, latestBlock - blockNumber + 1);
  if (confirmations < 1) throw new Error("Deployment receipt has no independent confirmation");

  return {
    verified: true,
    method: "base-sepolia-json-rpc",
    checkedAt: new Date().toISOString(),
    transactionHash: txHash,
    blockNumber,
    confirmations,
    contractAddress,
    createX: CREATEX,
    createXEvent: "ContractCreation(address)",
    runtimeCodeBytes: (onchainCode.length - 2) / 2,
    runtimeCodeHash: keccak256(onchainCode),
    runtimeComparison,
    immutableUsdc: usdc,
    domain: {
      name: domainName,
      version: domainVersion,
      chainId: Number(domainChainId),
      verifyingContract: getAddress(domainContract),
      separator: domainSeparator,
      expectedSeparator: expectedDomainSeparator,
    },
    explorer: `https://sepolia.basescan.org/address/${contractAddress}`,
    transactionExplorer: `https://sepolia.basescan.org/tx/${txHash}`,
  };
}

function minimalSourcifyContract(contract) {
  if (!contract || typeof contract !== "object") return null;
  return {
    match: contract.match ?? null,
    creationMatch: contract.creationMatch ?? null,
    runtimeMatch: contract.runtimeMatch ?? null,
    chainId: contract.chainId,
    address: contract.address,
    verifiedAt: contract.verifiedAt,
    matchId: contract.matchId,
  };
}

function minimalMirror(value) {
  if (!value || typeof value !== "object") return null;
  return {
    verificationId: value.verificationId,
    error: value.error,
    statusUrl: value.statusUrl,
    explorerUrl: value.explorerUrl,
  };
}

function sanitizeSourcifyJob(job) {
  return {
    isJobCompleted: job?.isJobCompleted === true,
    verificationId: job?.verificationId,
    contract: minimalSourcifyContract(job?.contract),
    error: job?.error
      ? { customCode: job.error.customCode, message: job.error.message, errorId: job.error.errorId }
      : null,
    etherscan: minimalMirror(job?.etherscan),
    blockscout: minimalMirror(job?.blockscout),
    routescan: minimalMirror(job?.routescan),
  };
}

async function sourcifyRequest(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: "Sourcify returned non-JSON" };
  }
  return { status: response.status, json };
}

async function sourcifyLookup(args, contractAddress) {
  const response = await sourcifyRequest(
    `${args.sourcifyUrl.replace(/\/$/, "")}/v2/contract/${CHAIN_ID}/${contractAddress}`,
  );
  return {
    httpStatus: response.status,
    contract: response.status === 200 ? minimalSourcifyContract(response.json) : null,
  };
}

async function verifyWithSourcify(args, context, contractAddress, transactionHash) {
  const baseUrl = args.sourcifyUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/v2/verify/${CHAIN_ID}/${contractAddress}`;
  const response = await sourcifyRequest(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: context.buildInfo.input,
      compilerVersion: context.buildInfo.solcLongVersion,
      contractIdentifier: CONTRACT_IDENTIFIER,
      creationTransactionHash: transactionHash,
    }),
  });

  if (response.status === 409 && response.json?.customCode === "already_verified") {
    const lookup = await sourcifyLookup(args, contractAddress);
    return {
      provider: "Sourcify API V2",
      submittedAt: new Date().toISOString(),
      alreadyVerified: true,
      submissionHttpStatus: response.status,
      lookup,
      verified: Boolean(lookup.contract?.runtimeMatch && lookup.contract?.creationMatch),
      repositoryUrl: `https://repo.sourcify.dev/${CHAIN_ID}/${contractAddress}`,
    };
  }

  if (![200, 201, 202].includes(response.status)) {
    return {
      provider: "Sourcify API V2",
      submittedAt: new Date().toISOString(),
      submissionHttpStatus: response.status,
      verified: false,
      error: {
        customCode: response.json?.customCode,
        message: response.json?.message ?? "Verification submission failed",
        errorId: response.json?.errorId,
      },
      repositoryUrl: `https://repo.sourcify.dev/${CHAIN_ID}/${contractAddress}`,
    };
  }

  const verificationId = response.json?.verificationId;
  if (typeof verificationId !== "string") {
    return {
      provider: "Sourcify API V2",
      submittedAt: new Date().toISOString(),
      submissionHttpStatus: response.status,
      verified: false,
      error: { message: "Sourcify response omitted verificationId" },
      repositoryUrl: `https://repo.sourcify.dev/${CHAIN_ID}/${contractAddress}`,
    };
  }

  const deadline = Date.now() + args.verificationTimeoutMs;
  let polls = 0;
  let job = null;
  while (Date.now() < deadline) {
    await sleep(3000);
    const status = await sourcifyRequest(`${baseUrl}/v2/verify/${verificationId}`);
    if (status.status !== 200) {
      job = { isJobCompleted: false, verificationId, error: { message: `Status HTTP ${status.status}` } };
      continue;
    }
    polls++;
    job = status.json;
    if (job?.isJobCompleted === true) break;
  }

  const sanitizedJob = sanitizeSourcifyJob(job);
  const lookup = await sourcifyLookup(args, contractAddress);
  const contract = sanitizedJob.contract ?? lookup.contract;
  const verified = Boolean(
    sanitizedJob.isJobCompleted &&
      contract?.runtimeMatch &&
      contract?.creationMatch &&
      !sanitizedJob.error,
  );
  return {
    provider: "Sourcify API V2",
    submittedAt: new Date().toISOString(),
    submissionHttpStatus: response.status,
    verificationId,
    polls,
    verified,
    job: sanitizedJob,
    lookup,
    repositoryUrl: `https://repo.sourcify.dev/${CHAIN_ID}/${contractAddress}`,
  };
}

function emitReport(args, report) {
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  mkdirSync(args.outDir, { recursive: true });
  mkdirSync(args.evidenceDir, { recursive: true });
  const proofPath = join(args.outDir, `v2-deployment-${stamp}.json`);
  const evidencePath = join(args.evidenceDir, `v2-deployment-${stamp}.json`);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(proofPath, serialized);
  writeFileSync(evidencePath, serialized);
  console.log(`Sanitized proof: ${proofPath}`);
  console.log(`Sanitized release evidence: ${evidencePath}`);
  return { proofPath, evidencePath };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args) return 0;
  const startedAt = new Date().toISOString();
  const report = {
    tool: "finaltab-v2-keeperhub-deployer",
    version: 1,
    startedAt,
    mode: args.buildOnly ? "BUILD_ONLY" : args.broadcast ? "SIMULATE_THEN_BROADCAST" : "SIMULATE_ONLY",
    chain: { name: "Base Sepolia", chainId: CHAIN_ID },
    result: "IN_PROGRESS",
  };

  let exitCode = 3;
  try {
    const context = readBuildContext();
    report.build = context.summary;
    console.log(
      `[build] ${CONTRACT_NAME}: ${context.summary.initCodeBytes} init bytes, ` +
        `${context.summary.runtimeBytecodeBytes} runtime bytes, ${context.summary.compilerVersion}`,
    );
    if (args.buildOnly) {
      report.result = "BUILD_PREFLIGHT_VERIFIED";
      exitCode = 0;
      return exitCode;
    }

    const rpcChainId = await rpc(args.rpcUrl, "eth_chainId", []);
    if (rpcChainId.toLowerCase() !== CHAIN_ID_HEX.toLowerCase()) {
      throw new Error(`RPC chain mismatch: expected ${CHAIN_ID_HEX}, got ${rpcChainId}`);
    }
    const createXCode = await rpc(args.rpcUrl, "eth_getCode", [CREATEX, "latest"]);
    const usdcCode = await rpc(args.rpcUrl, "eth_getCode", [USDC, "latest"]);
    if (createXCode === "0x" || usdcCode === "0x") {
      throw new Error("CreateX or Base Sepolia USDC has no runtime code");
    }
    report.preflight = {
      rpcChainId: CHAIN_ID,
      createX: CREATEX,
      createXCodeBytes: (createXCode.length - 2) / 2,
      createXCodeHash: keccak256(createXCode),
      usdc: USDC,
      usdcCodeBytes: (usdcCode.length - 2) / 2,
      usdcCodeHash: keccak256(usdcCode),
    };
    console.log("[preflight] Base Sepolia, CreateX, and USDC bytecode confirmed independently.");

    let { key: apiKey, source: credentialSource } = loadKeeperHubKey(args.envFile);
    assertOrgKey(apiKey);
    report.credential = { source: credentialSource, organizationKeyAccepted: false };

    const auth = await keeperHubApi(args.keeperHubUrl, apiKey, "GET", "/api/keys");
    report.keeperHub = { authHttpStatus: auth.status };
    if (auth.status !== 200) throw new Error(`KeeperHub organization-key probe returned HTTP ${auth.status}`);
    report.credential.organizationKeyAccepted = true;

    const chains = await keeperHubApi(args.keeperHubUrl, apiKey, "GET", "/api/chains");
    const chainList = Array.isArray(chains.json) ? chains.json : chains.json?.chains;
    const baseSepolia = Array.isArray(chainList)
      ? chainList.find((chain) => Number(chain.chainId) === CHAIN_ID)
      : null;
    report.keeperHub.chain = {
      found: Boolean(baseSepolia),
      enabled: baseSepolia?.isEnabled !== false,
    };
    if (!baseSepolia || baseSepolia.isEnabled === false) {
      throw new Error("KeeperHub does not report Base Sepolia as enabled");
    }

    const call = {
      chainId: CHAIN_ID,
      contractAddress: CREATEX,
      functionName: "deployCreate",
      functionArgs: JSON.stringify([context.initCode]),
      abi: JSON.stringify(CREATEX_ABI),
      value: "0",
      taskId: `finaltab-v2-deploy-${context.summary.initCodeHash.slice(2, 18)}`,
    };
    const simulation = await keeperHubApi(
      args.keeperHubUrl,
      apiKey,
      "POST",
      "/api/execute/contract-call",
      { ...call, simulate: true },
    );
    report.keeperHub.simulation = {
      httpStatus: simulation.status,
      ...sanitizeSimulation(simulation.json),
    };
    if (simulation.json?.wouldRevert === true) {
      throw new Error(
        `SIMULATION WOULD REVERT; nothing broadcast: ${
          simulation.json.revertReason ?? simulation.json.code ?? simulation.json.message ?? "unknown"
        }`,
      );
    }
    if (simulation.status >= 400 || simulation.json?.success !== true) {
      throw new Error(`KeeperHub simulation was not an explicit success (HTTP ${simulation.status}); nothing broadcast`);
    }
    console.log("[simulate] Clean explicit success. No transaction has been broadcast yet.");

    if (!args.broadcast) {
      report.result = "SIMULATION_VERIFIED_NO_BROADCAST";
      exitCode = 0;
      apiKey = null;
      return exitCode;
    }

    const idempotencySeed = keccak256(
      toHex(`finaltab-v2-deploy:${CHAIN_ID}:${CREATEX.toLowerCase()}:${context.summary.initCodeHash}`),
    );
    const idempotencyKey = stableUuid(idempotencySeed);
    console.log("[broadcast] Simulation gate passed; submitting the exact call with stable idempotency.");
    const accepted = await executeKeeperHub(args.keeperHubUrl, apiKey, call, idempotencyKey);
    report.keeperHub.executionId = accepted.executionId;
    report.keeperHub.idempotentReplay = accepted.idempotentReplay;
    const polled = await pollKeeperHub(
      args.keeperHubUrl,
      apiKey,
      accepted.executionId,
      args.timeoutMs,
    );
    report.keeperHub.polls = polled.polls;
    report.keeperHub.terminal = sanitizeTerminal(polled.terminal);
    if (!polled.terminal || !TERMINAL.has(polled.terminal.status)) {
      throw new Error("KeeperHub execution did not reach a terminal state within the timeout");
    }
    const verdict = classify(polled.terminal);
    report.keeperHub.verdict = { verdict: verdict.verdict, reason: verdict.reason };
    if (verdict.verdict !== "VERIFIED_SETTLED") {
      throw new Error(`KeeperHub deployment proof failed closed: ${verdict.verdict} ${verdict.reason ?? ""}`);
    }
    const transactionHash =
      polled.terminal.receipts?.[0]?.hash ?? polled.terminal.transactionHash ?? null;
    if (!transactionHash || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
      throw new Error("KeeperHub verified terminal response omitted a valid transaction hash");
    }

    apiKey = null;
    const deployment = await verifyDeploymentOnchain(args, context, transactionHash);
    report.deployment = deployment;
    console.log(`[verify] V2 runtime, USDC immutable, and EIP-712 domain verified at ${deployment.contractAddress}.`);

    try {
      report.sourceVerification = await verifyWithSourcify(
        args,
        context,
        deployment.contractAddress,
        transactionHash,
      );
    } catch (sourceError) {
      report.sourceVerification = {
        provider: "Sourcify API V2",
        submittedAt: new Date().toISOString(),
        verified: false,
        error: {
          message: sourceError instanceof Error ? sourceError.message : String(sourceError),
        },
        repositoryUrl: `https://repo.sourcify.dev/${CHAIN_ID}/${deployment.contractAddress}`,
      };
    }
    if (report.sourceVerification.verified) {
      report.result = "DEPLOYED_AND_SOURCE_VERIFIED";
      exitCode = 0;
      console.log("[source] Sourcify API V2 verified creation and runtime source matches.");
    } else {
      report.result = "DEPLOYED_VERIFIED_SOURCE_PENDING_OR_FAILED";
      exitCode = 2;
      console.log("[source] Deployment is independently proven; source verification is not yet proven.");
    }
    return exitCode;
  } catch (error) {
    report.result = "BLOCKED_OR_FAILED_CLOSED";
    report.error = error instanceof Error ? error.message : String(error);
    console.error(`[stop] ${report.error}`);
    return exitCode;
  } finally {
    report.finishedAt = new Date().toISOString();
    emitReport(args, report);
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 3;
  },
);
