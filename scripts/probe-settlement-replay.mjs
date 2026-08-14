#!/usr/bin/env node
// Read-only replay-rejection probe for the deployed V2 settlement contract.
//
// The durable submission journal, the deterministic KeeperHub idempotency key
// and the contract's `executed` mapping are three independent duplicate guards.
// Only the third one can be proven from outside the system with no credentials
// and no value at risk, so that is what this probe does.
//
// It rebuilds the calldata of a settlement that already executed, proves the
// rebuild is byte-identical to what was broadcast by matching the retained
// keccak256, and then replays it through `eth_call`. `eth_call` executes against
// a throwaway copy of state: no transaction is signed, nothing is submitted to a
// mempool, no gas is spent and no balance can change. A revert is the expected
// and required result.
//
// The same call is replayed against the block immediately before the original
// execution. If it succeeds there and reverts at head, the rejection is caused
// by durable onchain state rather than by anything wrong with the replay itself.
// Public RPCs frequently prune that state; an unavailable control is reported as
// unavailable, never as a pass.
//
// Usage:
//   node scripts/probe-settlement-replay.mjs \
//     [--evidence docs/release/evidence/<file>.json] \
//     [--rpc-url https://sepolia.base.org] \
//     [--out docs/release/evidence/<file>.json]

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromWeb = createRequire(join(ROOT, "apps", "web", "package.json"));
const requireFromRoot = createRequire(join(ROOT, "package.json"));
const { encodeFunctionData, decodeErrorResult, decodeFunctionResult, keccak256, size } = requireFromWeb("viem");

const DEFAULT_EVIDENCE = "docs/release/evidence/v2-live-settlement-2026-08-11T04-28-59-530Z.json";
const DEFAULT_RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

const parseArgs = (argv) => {
  const args = { evidence: DEFAULT_EVIDENCE, rpcUrl: DEFAULT_RPC, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--evidence") args.evidence = argv[++i];
    else if (argv[i] === "--rpc-url") args.rpcUrl = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return args;
};

const rpc = async (rpcUrl, method, params) => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} http ${response.status}`);
  const payload = await response.json();
  // A reverting eth_call is an RPC *error* carrying the revert data, which is
  // the outcome this probe is looking for, so errors are returned rather than
  // thrown and the caller decides what they mean.
  return payload.error ? { error: payload.error } : { result: payload.result };
};

/** Revert data, wherever this particular node chose to put it. */
const revertData = (error) => {
  const candidates = [error?.data?.data, error?.data, error?.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^0x[0-9a-fA-F]*$/.test(candidate) && candidate.length > 2) return candidate;
    if (typeof candidate === "string") {
      const embedded = /0x[0-9a-fA-F]{8,}/.exec(candidate);
      if (embedded) return embedded[0];
    }
  }
  return null;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const evidence = JSON.parse(readFileSync(resolve(ROOT, args.evidence), "utf8"));
  const artifact = requireFromRoot(
    "./contracts/artifacts/contracts/FinalTabBatchSettlementV2.sol/FinalTabBatchSettlementV2.json",
  );
  const abi = artifact.abi;

  const contract = evidence.scope.settlementContract;
  const settlementId = evidence.call.arguments.settlementId;
  const pull = evidence.call.arguments.pulls[0];
  const payout = evidence.call.arguments.payouts[0];
  const auth = evidence.consumedSignatures.receiveWithAuthorization;
  const consent = evidence.consumedSignatures.settlementConsent;

  const calldata = encodeFunctionData({
    abi,
    functionName: "executeSettlement",
    args: [
      settlementId,
      evidence.call.arguments.ledgerHash,
      [
        {
          from: pull.from,
          to: pull.to,
          value: BigInt(pull.value),
          validAfter: BigInt(pull.validAfter),
          validBefore: BigInt(pull.validBefore),
          nonce: pull.nonce,
          authV: auth.v,
          authR: auth.r,
          authS: auth.s,
          consentV: consent.v,
          consentR: consent.r,
          consentS: consent.s,
        },
      ],
      [{ creditor: payout.creditor, value: BigInt(payout.value) }],
    ],
  });

  const report = {
    tool: "finaltab-settlement-replay-rejection-probe",
    version: 1,
    startedAt: new Date().toISOString(),
    mode: "READ_ONLY_ETH_CALL",
    evidenceFile: args.evidence,
    rpcUrl: args.rpcUrl,
    contract,
    settlementId,
    checks: {},
  };
  const failures = [];
  const record = (name, passed, detail) => {
    report.checks[name] = { passed, ...detail };
    if (!passed) failures.push(name);
  };

  // 1. The rebuilt calldata is the calldata that was broadcast, byte for byte.
  const rebuiltHash = keccak256(calldata);
  record("calldataIdentity", rebuiltHash === evidence.call.calldataKeccak256 && size(calldata) === evidence.call.calldataBytes, {
    rebuiltKeccak256: rebuiltHash,
    retainedKeccak256: evidence.call.calldataKeccak256,
    rebuiltBytes: size(calldata),
    retainedBytes: evidence.call.calldataBytes,
  });

  const chainId = await rpc(args.rpcUrl, "eth_chainId", []);
  record("chainId", Number.parseInt(chainId.result ?? "0x0", 16) === evidence.scope.chainId, {
    observed: chainId.result ? Number.parseInt(chainId.result, 16) : null,
    expected: evidence.scope.chainId,
  });

  const head = await rpc(args.rpcUrl, "eth_blockNumber", []);
  const headBlock = head.result ? Number.parseInt(head.result, 16) : null;
  report.headBlock = headBlock;

  // 2. The contract's durable duplicate guard is set for this settlement.
  const executedCall = await rpc(args.rpcUrl, "eth_call", [
    { to: contract, data: encodeFunctionData({ abi, functionName: "executed", args: [settlementId] }) },
    "latest",
  ]);
  const executedFlag = executedCall.result
    ? decodeFunctionResult({ abi, functionName: "executed", data: executedCall.result })
    : null;
  record("executedFlagAtHead", executedFlag === true, { observed: executedFlag, error: executedCall.error ?? null });

  // 3. Replaying the exact broadcast calldata now reverts as AlreadyExecuted.
  const replay = await rpc(args.rpcUrl, "eth_call", [{ to: contract, data: calldata }, "latest"]);
  const replayRevert = replay.error ? revertData(replay.error) : null;
  let decoded = null;
  if (replayRevert) {
    try {
      const result = decodeErrorResult({ abi, data: replayRevert });
      decoded = { errorName: result.errorName, args: result.args.map(String) };
    } catch {
      decoded = null;
    }
  }
  record(
    "replayRevertsAlreadyExecuted",
    decoded?.errorName === "AlreadyExecuted" && decoded.args[0]?.toLowerCase() === settlementId.toLowerCase(),
    {
      returnedResult: replay.result ?? null,
      revertData: replayRevert,
      decoded,
      rpcErrorMessage: replay.error?.message ?? null,
    },
  );

  // 4. Control: the same calldata against the block before the original
  //    execution. Success there isolates durable state as the cause of the
  //    rejection above. Pruned history is reported, not silently passed.
  const priorBlock = evidence.onchain.blockNumber - 1;
  const control = await rpc(args.rpcUrl, "eth_call", [
    { to: contract, data: calldata },
    `0x${priorBlock.toString(16)}`,
  ]);
  const controlAvailable = control.result !== undefined && control.error === undefined;
  report.checks.preExecutionControl = {
    block: priorBlock,
    available: controlAvailable,
    succeeded: controlAvailable,
    rpcErrorMessage: control.error?.message ?? null,
    note: controlAvailable
      ? "identical calldata does not revert one block before execution"
      : "historical state unavailable on this RPC; control not performed",
  };

  report.finishedAt = new Date().toISOString();
  report.verdict = failures.length === 0 ? "REPLAY_REJECTED_BY_ONCHAIN_STATE" : "PROBE_FAILED";
  report.failedChecks = failures;
  report.valueMoved = false;
  report.transactionsSigned = 0;
  report.transactionsBroadcast = 0;

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) writeFileSync(resolve(ROOT, args.out), serialized);
  process.stdout.write(serialized);
  process.exitCode = failures.length === 0 ? 0 : 1;
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
