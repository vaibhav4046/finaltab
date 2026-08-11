import { describe, expect, it } from "vitest";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  aggregateSettlementTransfers,
  buildSettlementConsentTypedData,
  hashSettlementPlan,
  settlementAuthorizationNonce,
} from "../src/settlementPlan.js";

const CONTRACT = "0x1111111111111111111111111111111111111111" as const;
const LEDGER = `0x${"ab".repeat(32)}` as `0x${string}`;
const ALICE = "0x2222222222222222222222222222222222222222" as const;
const BOB = "0x3333333333333333333333333333333333333333" as const;
const CAROL = "0x4444444444444444444444444444444444444444" as const;

describe("V2 settlement plan", () => {
  it("aggregates one debit per debtor and one payout per creditor", () => {
    const plan = aggregateSettlementTransfers([
      { from: BOB, to: ALICE, value: 5n },
      { from: BOB, to: CAROL, value: 5n },
      { from: CAROL, to: ALICE, value: 3n },
    ]);
    expect(plan.debits).toEqual([
      { debtor: BOB.toLowerCase(), value: 10n },
      { debtor: CAROL.toLowerCase(), value: 3n },
    ]);
    expect(plan.payouts).toEqual([
      { creditor: ALICE.toLowerCase(), value: 8n },
      { creditor: CAROL.toLowerCase(), value: 5n },
    ]);
  });

  it("binds every debit and payout field", () => {
    const base = {
      ledgerHash: LEDGER,
      settlementContract: CONTRACT,
      debits: [{ debtor: BOB, value: 10n }],
      payouts: [{ creditor: ALICE, value: 10n }],
    };
    const hash = hashSettlementPlan(base);
    expect(hashSettlementPlan(base)).toBe(hash);
    expect(hashSettlementPlan({ ...base, ledgerHash: `0x${"cd".repeat(32)}` })).not.toBe(hash);
    expect(hashSettlementPlan({ ...base, debits: [{ debtor: BOB, value: 11n }] })).not.toBe(hash);
    expect(hashSettlementPlan({ ...base, payouts: [{ creditor: CAROL, value: 10n }] })).not.toBe(hash);
    expect(hashSettlementPlan({ ...base, settlementContract: CAROL })).not.toBe(hash);
    expect(hashSettlementPlan({ ...base, chainId: 1 })).not.toBe(hash);
    expect(hashSettlementPlan({ ...base, token: CAROL })).not.toBe(hash);
  });

  it("derives a debtor-specific nonce from the complete plan", () => {
    const planHash = hashSettlementPlan({
      ledgerHash: LEDGER,
      settlementContract: CONTRACT,
      debits: [{ debtor: BOB, value: 10n }],
      payouts: [{ creditor: ALICE, value: 10n }],
    });
    expect(settlementAuthorizationNonce(planHash, BOB, 10n)).not.toBe(
      settlementAuthorizationNonce(planHash, CAROL, 10n),
    );
    expect(settlementAuthorizationNonce(planHash, BOB, 10n)).not.toBe(
      settlementAuthorizationNonce(planHash, BOB, 11n),
    );
  });

  it("produces a recoverable V2 plan-consent signature", async () => {
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    const planHash = hashSettlementPlan({
      ledgerHash: LEDGER,
      settlementContract: CONTRACT,
      debits: [{ debtor: account.address, value: 10n }],
      payouts: [{ creditor: ALICE, value: 10n }],
    });
    const typed = buildSettlementConsentTypedData(CONTRACT, {
      planHash,
      debtor: account.address,
      value: 10n,
      validAfter: 0n,
      validBefore: 2_000_000_000n,
    });
    const signature = await account.signTypedData(typed);
    expect((await recoverTypedDataAddress({ ...typed, signature })).toLowerCase()).toBe(
      account.address.toLowerCase(),
    );
  });
});
