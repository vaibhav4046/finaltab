import { toFunctionSelector } from "viem";

/**
 * Legacy V1 call shape, retained only for decoding historical settlements.
 *
 * This lives in the engine rather than the web app because it is chain-facing
 * truth, and because keeping it importable without `server-only` is what lets
 * settlementAbi.test.ts check it against the compiled contract artifact. An
 * earlier version of this call was built from a hand-written signature that had
 * drifted from the deployed contract (three parameters instead of four); the
 * mismatch was invisible until a live call failed. The test is the fix.
 */

export const EXECUTE_SETTLEMENT_V1_SIGNATURE =
  "executeSettlement(bytes32,bytes32,(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)[],(address,uint256)[])";

/**
 * keccak256(EXECUTE_SETTLEMENT_V1_SIGNATURE)[0:4], verified present in the
 * runtime bytecode deployed at NEXT_PUBLIC_SETTLEMENT_CONTRACT on Base Sepolia.
 */
export const EXECUTE_SETTLEMENT_V1_SELECTOR = "0xab894f37";

export const EXECUTE_SETTLEMENT_V1_ABI = [
  {
    type: "function",
    name: "executeSettlement",
    stateMutability: "nonpayable",
    outputs: [],
    inputs: [
      { name: "settlementId", type: "bytes32" },
      { name: "ledgerHash", type: "bytes32" },
      {
        name: "pulls",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
      {
        name: "payouts",
        type: "tuple[]",
        components: [
          { name: "creditor", type: "address" },
          { name: "value", type: "uint256" },
        ],
      },
    ],
  },
] as const;

/** V2 adds a FINALTab-domain plan-consent signature to every USDC pull. */
export const EXECUTE_SETTLEMENT_V2_SIGNATURE =
  "executeSettlement(bytes32,bytes32,(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32,uint8,bytes32,bytes32)[],(address,uint256)[])";

export const EXECUTE_SETTLEMENT_V2_SELECTOR = toFunctionSelector(EXECUTE_SETTLEMENT_V2_SIGNATURE);

export const EXECUTE_SETTLEMENT_V2_ABI = [
  {
    type: "function",
    name: "executeSettlement",
    stateMutability: "nonpayable",
    outputs: [],
    inputs: [
      { name: "settlementId", type: "bytes32" },
      { name: "ledgerHash", type: "bytes32" },
      {
        name: "pulls",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
          { name: "authV", type: "uint8" },
          { name: "authR", type: "bytes32" },
          { name: "authS", type: "bytes32" },
          { name: "consentV", type: "uint8" },
          { name: "consentR", type: "bytes32" },
          { name: "consentS", type: "bytes32" },
        ],
      },
      {
        name: "payouts",
        type: "tuple[]",
        components: [
          { name: "creditor", type: "address" },
          { name: "value", type: "uint256" },
        ],
      },
    ],
  },
] as const;

/** Safe-by-default public aliases. New callers must encode the V2 plan-consent shape. */
export const EXECUTE_SETTLEMENT_SIGNATURE = EXECUTE_SETTLEMENT_V2_SIGNATURE;
export const EXECUTE_SETTLEMENT_SELECTOR = EXECUTE_SETTLEMENT_V2_SELECTOR;
export const EXECUTE_SETTLEMENT_ABI = EXECUTE_SETTLEMENT_V2_ABI;
