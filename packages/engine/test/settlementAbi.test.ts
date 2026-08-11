import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, toHex, toFunctionSelector } from "viem";
import {
  EXECUTE_SETTLEMENT_ABI,
  EXECUTE_SETTLEMENT_SELECTOR,
  EXECUTE_SETTLEMENT_SIGNATURE,
  EXECUTE_SETTLEMENT_V1_ABI,
  EXECUTE_SETTLEMENT_V1_SELECTOR,
  EXECUTE_SETTLEMENT_V1_SIGNATURE,
  EXECUTE_SETTLEMENT_V2_ABI,
  EXECUTE_SETTLEMENT_V2_SELECTOR,
  EXECUTE_SETTLEMENT_V2_SIGNATURE,
} from "../src/settlementAbi.js";

/**
 * Guards the seam between the app's hand-maintained call shape and the actual
 * compiled contract. These three descriptions of executeSettlement must agree:
 * the signature string, the ABI fragment, and the Solidity source. They did not
 * agree once, and the resulting call could never have executed.
 */

const ARTIFACT = resolve(
  __dirname,
  "../../../contracts/artifacts/contracts/FinalTabBatchSettlement.sol/FinalTabBatchSettlement.json",
);

const V2_ARTIFACT = resolve(
  __dirname,
  "../../../contracts/artifacts/contracts/FinalTabBatchSettlementV2.sol/FinalTabBatchSettlementV2.json",
);

interface AbiInput {
  name: string;
  type: string;
  components?: AbiInput[];
}

interface AbiFunction {
  name: string;
  inputs: AbiInput[];
}

function asAbiFunction(value: unknown): AbiFunction {
  const entry = value as Partial<AbiFunction> | undefined;
  if (!entry || typeof entry.name !== "string" || !Array.isArray(entry.inputs)) {
    throw new Error("Malformed executeSettlement ABI entry");
  }
  return entry as AbiFunction;
}

function artifactExecuteSettlement(): AbiFunction {
  const abi = JSON.parse(readFileSync(ARTIFACT, "utf8")).abi as Array<Record<string, unknown>>;
  const fn = abi.find((e) => e.name === "executeSettlement");
  if (!fn) throw new Error("executeSettlement missing from compiled artifact");
  return asAbiFunction(fn);
}

function artifactV2ExecuteSettlement(): AbiFunction {
  const abi = JSON.parse(readFileSync(V2_ARTIFACT, "utf8")).abi as Array<Record<string, unknown>>;
  const fn = abi.find((e) => e.name === "executeSettlement");
  if (!fn) throw new Error("V2 executeSettlement missing from compiled artifact");
  return asAbiFunction(fn);
}

/** Canonical Solidity signature for an ABI function entry, tuples expanded. */
function canonicalSignature(fn: AbiFunction): string {
  const typeOf = (input: AbiInput): string =>
    input.type.startsWith("tuple")
      ? `(${(input.components ?? []).map(typeOf).join(",")})${input.type.slice("tuple".length)}`
      : input.type;
  return `${fn.name}(${fn.inputs.map(typeOf).join(",")})`;
}

describe("executeSettlement call shape", () => {
  it("signature constant matches the compiled contract", () => {
    expect(canonicalSignature(artifactExecuteSettlement())).toBe(EXECUTE_SETTLEMENT_V1_SIGNATURE);
  });

  it("ABI fragment matches the compiled contract", () => {
    expect(canonicalSignature(asAbiFunction(EXECUTE_SETTLEMENT_V1_ABI[0]))).toBe(
      canonicalSignature(artifactExecuteSettlement()),
    );
  });

  it("selector constant matches the signature", () => {
    expect(keccak256(toHex(EXECUTE_SETTLEMENT_V1_SIGNATURE)).slice(0, 10)).toBe(EXECUTE_SETTLEMENT_V1_SELECTOR);
    expect(toFunctionSelector(EXECUTE_SETTLEMENT_V1_SIGNATURE)).toBe(EXECUTE_SETTLEMENT_V1_SELECTOR);
  });

  it("takes four parameters, with payouts last", () => {
    // The regression: payouts was absent, so the app encoded a three-argument
    // call against a four-argument function.
    const inputs = artifactExecuteSettlement().inputs;
    expect(inputs.map((i) => i.name)).toEqual(["settlementId", "ledgerHash", "pulls", "payouts"]);
  });
});

describe("V2 executeSettlement call shape", () => {
  it("signature and ABI match the compiled V2 contract", () => {
    expect(canonicalSignature(artifactV2ExecuteSettlement())).toBe(EXECUTE_SETTLEMENT_V2_SIGNATURE);
    expect(canonicalSignature(asAbiFunction(EXECUTE_SETTLEMENT_V2_ABI[0]))).toBe(
      canonicalSignature(artifactV2ExecuteSettlement()),
    );
  });

  it("selector matches the V2 signature", () => {
    expect(toFunctionSelector(EXECUTE_SETTLEMENT_V2_SIGNATURE)).toBe(EXECUTE_SETTLEMENT_V2_SELECTOR);
  });

  it("includes both USDC authorization and plan-consent signatures", () => {
    const pulls = artifactV2ExecuteSettlement().inputs[2]!;
    expect((pulls.components ?? []).map((component) => component.name)).toEqual([
      "from",
      "to",
      "value",
      "validAfter",
      "validBefore",
      "nonce",
      "authV",
      "authR",
      "authS",
      "consentV",
      "consentR",
      "consentS",
    ]);
  });

  it("is the safe-by-default exported call shape", () => {
    expect(EXECUTE_SETTLEMENT_SIGNATURE).toBe(EXECUTE_SETTLEMENT_V2_SIGNATURE);
    expect(EXECUTE_SETTLEMENT_SELECTOR).toBe(EXECUTE_SETTLEMENT_V2_SELECTOR);
    expect(EXECUTE_SETTLEMENT_ABI).toBe(EXECUTE_SETTLEMENT_V2_ABI);
  });
});
