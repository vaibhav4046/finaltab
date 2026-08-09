import { keccak256, toHex, encodeAbiParameters } from "viem";

/**
 * EIP-3009 transferWithAuthorization typed data for Base Sepolia USDC.
 * Domain params verified ON-CHAIN this project (2026-08-09):
 *   name()   = "USDC"
 *   version()= "2"
 *   DOMAIN_SEPARATOR = 0x71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818
 *   TRANSFER_WITH_AUTHORIZATION_TYPEHASH = 0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267
 */

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const EXPECTED_DOMAIN_SEPARATOR =
  "0x71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818" as const;
export const EXPECTED_TRANSFER_TYPEHASH =
  "0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267" as const;

export const USDC_DOMAIN = {
  name: "USDC",
  version: "2",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  verifyingContract: BASE_SEPOLIA_USDC,
} as const;

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface TransferAuthorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
}

/** Full typed-data payload for wallet signTypedData / viem signTypedData. */
export function buildTransferAuthorizationTypedData(auth: TransferAuthorization) {
  return {
    domain: USDC_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message: auth,
  };
}

/** Recompute EIP-712 domain separator from parts — test asserts equality with on-chain value. */
export function computeDomainSeparator(): `0x${string}` {
  const typeHash = keccak256(
    toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        typeHash,
        keccak256(toHex(USDC_DOMAIN.name)),
        keccak256(toHex(USDC_DOMAIN.version)),
        BigInt(USDC_DOMAIN.chainId),
        USDC_DOMAIN.verifyingContract,
      ],
    ),
  );
}

/** Recompute the struct typehash — test asserts equality with on-chain value. */
export function computeTransferTypehash(): `0x${string}` {
  return keccak256(
    toHex(
      "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)",
    ),
  );
}
