import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildReceiveAuthorizationTypedData,
  buildSettlementConsentTypedData,
  settlementAuthorizationNonce,
} from "@finaltab/engine";
import {
  AGENT_SIGNERS,
  formatUsdcMinor,
  prepareAgentSettlement,
  resolveAgentSigners,
  signPreparedTransfers,
  type AgentDebt,
  type AgentSignerId,
} from "../lib/server/agentSettlement";

// Hardhat's public throwaway keys — printed in every Hardhat README, zero
// secrecy. The REAL demo signer keys must never appear in tests or output.
const THROWAWAY_KEYS: Record<AgentSignerId, `0x${string}`> = {
  vee: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  hem: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  ravi: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
};

const CONTRACT = "0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64" as const;

function throwawayAccounts() {
  const map = new Map(
    AGENT_SIGNERS.map((s) => [s.id, privateKeyToAccount(THROWAWAY_KEYS[s.id])]),
  );
  return map;
}

function throwawayAddresses(): Record<AgentSignerId, `0x${string}`> {
  const out = {} as Record<AgentSignerId, `0x${string}`>;
  for (const [id, account] of throwawayAccounts()) out[id] = account.address;
  return out;
}

const DEBTS: AgentDebt[] = [
  { debtor: "hem", creditor: "vee", amountUsd: "4.20" },
  { debtor: "ravi", creditor: "vee", amountUsd: "3.80" },
];

describe("prepareAgentSettlement", () => {
  it("is deterministic for the same debts and receiptRef", () => {
    const a = prepareAgentSettlement(DEBTS, throwawayAddresses(), CONTRACT, "receipt-1");
    const b = prepareAgentSettlement(DEBTS, throwawayAddresses(), CONTRACT, "receipt-1");
    expect(a.settlementId).toBe(b.settlementId);
    expect(a.ledgerHash).toBe(b.ledgerHash);
    expect(a.canonicalJson).toBe(b.canonicalJson);
  });

  it("produces a different settlementId for a different receiptRef", () => {
    const a = prepareAgentSettlement(DEBTS, throwawayAddresses(), CONTRACT, "receipt-1");
    const b = prepareAgentSettlement(DEBTS, throwawayAddresses(), CONTRACT, "receipt-2");
    expect(a.settlementId).not.toBe(b.settlementId);
  });

  it("converts USD to USDC minor units at x10000 per cent", () => {
    const prepared = prepareAgentSettlement(DEBTS, throwawayAddresses(), CONTRACT, "r");
    const hem = prepared.transfers.find((t) => t.fromId === "hem")!;
    expect(hem.value).toBe("4200000"); // $4.20 → 4.20 USDC minor units
  });

  it("nets opposing debts and drops uninvolved participants", () => {
    const prepared = prepareAgentSettlement(
      [
        { debtor: "hem", creditor: "vee", amountUsd: "10.00" },
        { debtor: "vee", creditor: "hem", amountUsd: "6.00" },
      ],
      throwawayAddresses(),
      CONTRACT,
      "r",
    );
    expect(prepared.transfers).toHaveLength(1);
    expect(prepared.transfers[0]).toMatchObject({ fromId: "hem", toId: "vee", value: "4000000" });
    expect(prepared.participants.map((p) => p.id).sort()).toEqual(["hem", "vee"]);
  });

  it("aggregates payouts by creditor and conserves money exactly", () => {
    const prepared = prepareAgentSettlement(DEBTS, throwawayAddresses(), CONTRACT, "r");
    const pulled = prepared.debits.reduce((acc, t) => acc + BigInt(t.value), 0n);
    const paid = prepared.payouts.reduce((acc, p) => acc + BigInt(p.value), 0n);
    expect(paid).toBe(pulled);
    expect(prepared.payouts).toHaveLength(1); // both debts flow to vee
    expect(prepared.payouts[0]!.value).toBe("8000000");
  });

  it("rejects self-debts, empty input, and zero-net graphs", () => {
    const addrs = throwawayAddresses();
    expect(() =>
      prepareAgentSettlement(
        [{ debtor: "vee", creditor: "vee", amountUsd: "1.00" }],
        addrs,
        CONTRACT,
      ),
    ).toThrow(/self-debt/);
    expect(() => prepareAgentSettlement([], addrs, CONTRACT)).toThrow(/no debts/);
    expect(() =>
      prepareAgentSettlement(
        [
          { debtor: "hem", creditor: "vee", amountUsd: "5.00" },
          { debtor: "vee", creditor: "hem", amountUsd: "5.00" },
        ],
        addrs,
        CONTRACT,
      ),
    ).toThrow(/net to zero/);
  });
});

describe("signPreparedTransfers", () => {
  it("signs one USDC authorization and one plan consent per aggregated debtor", async () => {
    const prepared = prepareAgentSettlement(DEBTS, throwawayAddresses(), CONTRACT, "r");
    const signed = await signPreparedTransfers(prepared, throwawayAccounts(), CONTRACT);
    expect(signed).toHaveLength(prepared.debits.length);

    for (const auth of signed) {
      expect(auth.to).toBe(CONTRACT);
      expect([27, 28]).toContain(auth.authV);
      expect([27, 28]).toContain(auth.consentV);
      expect(auth.nonce).toBe(
        settlementAuthorizationNonce(prepared.settlementId, auth.from, BigInt(auth.value)),
      );

      // The signature must recover to the debtor over the exact typed data
      // the settlement contract forwards to USDC.
      const recovered = await recoverTypedDataAddress({
        ...buildReceiveAuthorizationTypedData({
          from: auth.from,
          to: auth.to,
          value: BigInt(auth.value),
          validAfter: BigInt(auth.validAfter),
          validBefore: BigInt(auth.validBefore),
          nonce: auth.nonce,
        }),
        signature: {
          r: auth.authR,
          s: auth.authS,
          v: BigInt(auth.authV),
        },
      });
      expect(recovered.toLowerCase()).toBe(auth.from.toLowerCase());

      const consentRecovered = await recoverTypedDataAddress({
        ...buildSettlementConsentTypedData(CONTRACT, {
          planHash: prepared.settlementId,
          debtor: auth.from,
          value: BigInt(auth.value),
          validAfter: BigInt(auth.validAfter),
          validBefore: BigInt(auth.validBefore),
        }),
        signature: {
          r: auth.consentR,
          s: auth.consentS,
          v: BigInt(auth.consentV),
        },
      });
      expect(consentRecovered.toLowerCase()).toBe(auth.from.toLowerCase());
    }
  });

  it("refuses to sign when the key does not match the ledger address", async () => {
    const prepared = prepareAgentSettlement(DEBTS, throwawayAddresses(), CONTRACT, "r");
    const wrongAccounts = throwawayAccounts();
    // Swap hem's account for vee's: address mismatch against the frozen ledger.
    wrongAccounts.set("hem", wrongAccounts.get("vee")!);
    await expect(signPreparedTransfers(prepared, wrongAccounts, CONTRACT)).rejects.toThrow(
      /key\/address mismatch/,
    );
  });
});

describe("formatUsdcMinor", () => {
  it("renders minor units as a 2dp USDC string", () => {
    expect(formatUsdcMinor("4200000")).toBe("4.20");
    expect(formatUsdcMinor(0n)).toBe("0.00");
    expect(formatUsdcMinor("20000000")).toBe("20.00");
    expect(formatUsdcMinor("1050000")).toBe("1.05");
  });
});

describe("resolveAgentSigners (env path)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves all signers from env vars and derives matching addresses", () => {
    for (const s of AGENT_SIGNERS) vi.stubEnv(s.envVar, THROWAWAY_KEYS[s.id]);
    const { accounts, status } = resolveAgentSigners();
    expect(accounts).not.toBeNull();
    for (const s of AGENT_SIGNERS) {
      expect(status[s.id]).toBe("PRESENT");
      expect(accounts!.get(s.id)!.address).toBe(throwawayAddresses()[s.id]);
    }
  });

  it("reports MALFORMED for a bad env value instead of silently falling back", () => {
    for (const s of AGENT_SIGNERS) vi.stubEnv(s.envVar, THROWAWAY_KEYS[s.id]);
    vi.stubEnv("FINALTAB_AGENT_KEY_HEM", "not-a-key");
    const { accounts, status } = resolveAgentSigners();
    expect(accounts).toBeNull();
    expect(status.hem).toBe("MALFORMED");
    expect(status.vee).toBe("PRESENT");
    expect(status.ravi).toBe("PRESENT");
  });
});
