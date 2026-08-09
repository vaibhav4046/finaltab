import { describe, it, expect } from "vitest";
import {
  canonicalizeLedger,
  ledgerToCanonicalJson,
  ledgerHash,
  settlementId,
  transferNonce,
  type CanonicalLedger,
} from "../src/ledger.js";
import { BASE_SEPOLIA_USDC, BASE_SEPOLIA_CHAIN_ID } from "../src/eip3009.js";

const A = "0x1111111111111111111111111111111111111111" as const;
const B = "0x2222222222222222222222222222222222222222" as const;

function sampleLedger(): CanonicalLedger {
  return {
    version: 1,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    participants: [
      { id: "bob", address: B, displayName: "Bob" },
      { id: "alice", address: A, displayName: "Alice" },
    ],
    transfers: [{ from: B, to: A, value: 12340000n }],
    receiptIds: ["r2", "r1"],
  };
}

describe("canonicalizeLedger", () => {
  it("sorts participants and receipts, lowercases addresses", () => {
    const c = canonicalizeLedger(sampleLedger());
    expect(c.participants.map((p) => p.id)).toEqual(["alice", "bob"]);
    expect(c.receiptIds).toEqual(["r1", "r2"]);
    expect(c.token).toBe(BASE_SEPOLIA_USDC.toLowerCase());
  });
  it("rejects zero-value transfers and bad addresses", () => {
    const bad = sampleLedger();
    bad.transfers = [{ from: B, to: A, value: 0n }];
    expect(() => canonicalizeLedger(bad)).toThrow();
    const bad2 = sampleLedger();
    bad2.token = "0xnothex" as `0x${string}`;
    expect(() => canonicalizeLedger(bad2)).toThrow();
  });
});

describe("ledgerHash", () => {
  it("is stable across participant/receipt input order", () => {
    const l1 = sampleLedger();
    const l2 = sampleLedger();
    l2.participants.reverse();
    l2.receiptIds.reverse();
    expect(ledgerHash(l1)).toBe(ledgerHash(l2));
  });
  it("changes when ANY field changes (edit invalidates)", () => {
    const base = ledgerHash(sampleLedger());
    const edited = sampleLedger();
    edited.transfers = [{ from: B, to: A, value: 12340001n }]; // one cent-equivalent
    expect(ledgerHash(edited)).not.toBe(base);
    const edited2 = sampleLedger();
    edited2.receiptIds = ["r1", "r2", "r3"];
    expect(ledgerHash(edited2)).not.toBe(base);
  });
  it("canonical JSON has bigints as strings", () => {
    const json = ledgerToCanonicalJson(sampleLedger());
    expect(json).toContain('"value":"12340000"');
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("settlementId + transferNonce", () => {
  it("settlementId deterministic from hash", () => {
    const h = ledgerHash(sampleLedger());
    expect(settlementId(h)).toBe(settlementId(h));
    expect(settlementId(h)).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("nonces unique per transfer index and bound to ledger", () => {
    const h1 = ledgerHash(sampleLedger());
    const edited = sampleLedger();
    edited.receiptIds = ["r1"];
    const h2 = ledgerHash(edited);
    const n1 = transferNonce(h1, B, A, 12340000n, 0);
    const n1b = transferNonce(h1, B, A, 12340000n, 1);
    const n2 = transferNonce(h2, B, A, 12340000n, 0);
    expect(n1).not.toBe(n1b); // index distinguishes
    expect(n1).not.toBe(n2); // ledger hash distinguishes
    expect(n1).toBe(transferNonce(h1, B, A, 12340000n, 0)); // deterministic
  });
});
