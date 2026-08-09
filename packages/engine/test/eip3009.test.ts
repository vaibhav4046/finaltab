import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import {
  computeDomainSeparator,
  computeTransferTypehash,
  EXPECTED_DOMAIN_SEPARATOR,
  EXPECTED_TRANSFER_TYPEHASH,
  buildTransferAuthorizationTypedData,
  USDC_DOMAIN,
} from "../src/eip3009.js";

describe("EIP-712 domain — verified against on-chain Base Sepolia USDC", () => {
  it("computed domain separator equals on-chain DOMAIN_SEPARATOR", () => {
    // On-chain value read from 0x036CbD53842c5426634e7929541eC2318f3dCF7e (2026-08-09).
    expect(computeDomainSeparator()).toBe(EXPECTED_DOMAIN_SEPARATOR);
  });
  it("computed typehash equals on-chain TRANSFER_WITH_AUTHORIZATION_TYPEHASH", () => {
    expect(computeTransferTypehash()).toBe(EXPECTED_TRANSFER_TYPEHASH);
  });
});

describe("typed-data payload", () => {
  it("signs and verifies with viem", async () => {
    const pk = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
    const account = privateKeyToAccount(pk);
    const auth = {
      from: account.address,
      to: "0x2222222222222222222222222222222222222222" as const,
      value: 12340000n,
      validAfter: 0n,
      validBefore: 2000000000n,
      nonce: "0x00000000000000000000000000000000000000000000000000000000000000aa" as const,
    };
    const typed = buildTransferAuthorizationTypedData(auth);
    const signature = await account.signTypedData(typed);
    const valid = await verifyTypedData({ ...typed, address: account.address, signature });
    expect(valid).toBe(true);
    expect(typed.domain).toEqual(USDC_DOMAIN);
  });
});
