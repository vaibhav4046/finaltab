import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, toHex, toFunctionSelector } from "viem";
import {
  EXECUTE_SETTLEMENT_ABI,
  EXECUTE_SETTLEMENT_SELECTOR,
  EXECUTE_SETTLEMENT_SIGNATURE,
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

function artifactExecuteSettlement() {
  const abi = JSON.parse(readFileSync(ARTIFACT, "utf8")).abi as Array<Record<string, unknown>>;
  const fn = abi.find((e) => e.name === "executeSettlement");
  if (!fn) throw new Error("executeSettlement missing from compiled artifact");
  return fn;
}

/** Canonical Solidity signature for an ABI function entry, tuples expanded. */
function canonicalSignature(fn: Record<string, any>): string {
  const typeOf = (input: any): string =>
    input.type.startsWith("tuple")
      ? `(${input.components.map(typeOf).join(",")})${input.type.slice("tuple".length)}`
      : input.type;
  return `${fn.name}(${fn.inputs.map(typeOf).join(",")})`;
}

describe("executeSettlement call shape", () => {
  it("signature constant matches the compiled contract", () => {
    expect(canonicalSignature(artifactExecuteSettlement())).toBe(EXECUTE_SETTLEMENT_SIGNATURE);
  });

  it("ABI fragment matches the compiled contract", () => {
    expect(canonicalSignature(EXECUTE_SETTLEMENT_ABI[0] as any)).toBe(
      canonicalSignature(artifactExecuteSettlement()),
    );
  });

  it("selector constant matches the signature", () => {
    expect(keccak256(toHex(EXECUTE_SETTLEMENT_SIGNATURE)).slice(0, 10)).toBe(EXECUTE_SETTLEMENT_SELECTOR);
    expect(toFunctionSelector(EXECUTE_SETTLEMENT_SIGNATURE)).toBe(EXECUTE_SETTLEMENT_SELECTOR);
  });

  it("takes four parameters, with payouts last", () => {
    // The regression: payouts was absent, so the app encoded a three-argument
    // call against a four-argument function.
    const inputs = artifactExecuteSettlement().inputs as any[];
    expect(inputs.map((i) => i.name)).toEqual(["settlementId", "ledgerHash", "pulls", "payouts"]);
  });
});
