import { afterEach, describe, expect, it } from "vitest";
import {
  EXECUTE_SETTLEMENT_V2_SIGNATURE,
  hashSettlementPlan,
  settlementAuthorizationNonce,
} from "@finaltab/engine";
import {
  SettleBodySchema,
  requiredV2SettlementContract,
  settleContractCall,
  type SettleBody,
} from "../lib/server/settlement";

const CONTRACT = "0x1111111111111111111111111111111111111111" as const;
const DEBTOR = "0x2222222222222222222222222222222222222222" as const;
const CREDITOR = "0x3333333333333333333333333333333333333333" as const;
const ATTACKER = "0x4444444444444444444444444444444444444444" as const;
const LEDGER = `0x${"ab".repeat(32)}` as `0x${string}`;
const SIGNATURE_WORD = `0x${"01".repeat(32)}` as `0x${string}`;
const originalContract = process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT;
const originalVersion = process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION;

afterEach(() => {
  if (originalContract === undefined) delete process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT;
  else process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = originalContract;
  if (originalVersion === undefined) delete process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION;
  else process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION = originalVersion;
});

function bodyFor(creditor: `0x${string}` = CREDITOR): SettleBody {
  const value = 10_000_000n;
  const planHash = hashSettlementPlan({
    ledgerHash: LEDGER,
    settlementContract: CONTRACT,
    debits: [{ debtor: DEBTOR, value }],
    payouts: [{ creditor, value }],
  });
  return SettleBodySchema.parse({
    settlementId: planHash,
    ledgerHash: LEDGER,
    transfers: [
      {
        from: DEBTOR,
        to: CONTRACT,
        value: value.toString(),
        validAfter: "0",
        validBefore: "2000000000",
        nonce: settlementAuthorizationNonce(planHash, DEBTOR, value),
        authV: 27,
        authR: SIGNATURE_WORD,
        authS: SIGNATURE_WORD,
        consentV: 27,
        consentR: SIGNATURE_WORD,
        consentS: SIGNATURE_WORD,
      },
    ],
    payouts: [{ creditor, value: value.toString() }],
  });
}

describe("V2 settlement server boundary", () => {
  it("refuses value-moving configuration unless the contract is explicitly versioned V2", () => {
    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT = CONTRACT;
    delete process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION;
    expect(() => requiredV2SettlementContract()).toThrow(/VERSION=2/);

    process.env.FINALTAB_SETTLEMENT_CONTRACT_VERSION = "2";
    expect(requiredV2SettlementContract()).toBe(CONTRACT);
  });

  it("builds only the V2 two-signature KeeperHub call", () => {
    const call = settleContractCall(bodyFor(), CONTRACT);
    const abi = JSON.parse(call.abi);
    const components = abi[0].inputs[2].components.map((part: { name: string }) => part.name);
    expect(components).toEqual([
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
    expect(EXECUTE_SETTLEMENT_V2_SIGNATURE).toContain("uint8,bytes32,bytes32,uint8,bytes32,bytes32");
  });

  it("rejects payout redirection before the request reaches KeeperHub", () => {
    const original = bodyFor();
    const redirected = SettleBodySchema.parse({
      ...original,
      payouts: [{ creditor: ATTACKER, value: original.payouts[0]!.value }],
    });
    expect(() => settleContractCall(redirected, CONTRACT)).toThrow(/complete debit\+payout plan/);
  });

  it("rejects an attacker-recomputed plan id when the debtor nonce is stale", () => {
    const original = bodyFor();
    const redirectedHash = hashSettlementPlan({
      ledgerHash: LEDGER,
      settlementContract: CONTRACT,
      debits: [{ debtor: DEBTOR, value: 10_000_000n }],
      payouts: [{ creditor: ATTACKER, value: 10_000_000n }],
    });
    const forged = SettleBodySchema.parse({
      ...original,
      settlementId: redirectedHash,
      payouts: [{ creditor: ATTACKER, value: "10000000" }],
    });
    expect(() => settleContractCall(forged, CONTRACT)).toThrow(/nonce does not match/);
  });

  it("rejects duplicate debtors instead of allowing duplicate EIP-3009 nonces", () => {
    const original = bodyFor();
    expect(() =>
      SettleBodySchema.parse({
        ...original,
        transfers: [
          { ...original.transfers[0], value: "5000000" },
          { ...original.transfers[0], value: "5000000" },
        ],
      }),
    ).toThrow(/debtors must be unique and sorted/);
  });
});
