/**
 * The single contract function FINALTab is allowed to call.
 *
 * This lives in the engine rather than the web app because it is chain-facing
 * truth, and because keeping it importable without `server-only` is what lets
 * settlementAbi.test.ts check it against the compiled contract artifact. An
 * earlier version of this call was built from a hand-written signature that had
 * drifted from the deployed contract (three parameters instead of four); the
 * mismatch was invisible until a live call failed. The test is the fix.
 */

export const EXECUTE_SETTLEMENT_SIGNATURE =
  "executeSettlement(bytes32,bytes32,(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)[],(address,uint256)[])";

/**
 * keccak256(EXECUTE_SETTLEMENT_SIGNATURE)[0:4], verified present in the
 * runtime bytecode deployed at NEXT_PUBLIC_SETTLEMENT_CONTRACT on Base Sepolia.
 */
export const EXECUTE_SETTLEMENT_SELECTOR = "0xab894f37";

export const EXECUTE_SETTLEMENT_ABI = [
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
