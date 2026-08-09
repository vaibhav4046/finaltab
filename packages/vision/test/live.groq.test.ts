/**
 * LIVE Groq smoke test — runs only when GROQ_API_KEY is set.
 * Exercises the REAL vision model end-to-end against the generated fixture
 * receipt, then runs the deterministic reconciler on the model's output.
 *
 *   GROQ_API_KEY=... pnpm vitest run test/live.groq.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GroqClient } from "../src/groqClient.js";
import { parseReceiptImage } from "../src/parseReceipt.js";
import { proposeAllocation } from "../src/proposeAllocation.js";
import { checkReceiptArithmetic, reconcileAllocation, sharesToDebts, parseFiat, sum } from "@finaltab/engine";

const apiKey = process.env.GROQ_API_KEY;
const fixturePath = join(__dirname, "fixtures", "receipt-sample.png");
const enabled = Boolean(apiKey) && existsSync(fixturePath);

describe.skipIf(!enabled)("LIVE Groq vision pipeline (fixture receipt)", () => {
  it("extracts, reconciles, and allocates the sample receipt", async () => {
    const client = new GroqClient({ apiKey: apiKey! });
    const dataUrl = `data:image/png;base64,${readFileSync(fixturePath).toString("base64")}`;

    const { receipt, attempts } = await parseReceiptImage(client, dataUrl);
    console.log(`extraction attempts: ${attempts}`);
    console.log(JSON.stringify(receipt, null, 2));

    expect(receipt.merchant.toLowerCase()).toContain("dishoom");
    expect(receipt.currency).toBe("GBP");
    expect(receipt.total).toBe("54.00");
    expect(receipt.items.length).toBe(4);

    // Deterministic validator over the model output — must be arithmetically clean.
    const issues = checkReceiptArithmetic(receipt);
    console.log(`arithmetic issues: ${JSON.stringify(issues)}`);
    expect(issues).toEqual([]);

    // NL allocation via the real model.
    const participants = [
      { id: "vee", name: "Vee" },
      { id: "hem", name: "Hem" },
      { id: "ravi", name: "Ravi" },
    ];
    const { proposal } = await proposeAllocation(client, {
      receipt,
      participants,
      payerId: "vee",
      instruction:
        "Vee and Hem shared the black daal and the garlic naan. Ravi had both chicken rubies. The mango lassi was Hem's.",
    });
    console.log(JSON.stringify(proposal, null, 2));

    // Deterministic reconciliation: model proposal -> cent-perfect shares.
    const result = reconcileAllocation(receipt, proposal);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.shares).not.toBeNull();
    const total = parseFiat(receipt.total);
    expect(result.totalMinor).toBe(total);
    // shares cover EVERY consuming participant (payer included) and conserve the total.
    const consumed = sum([...result.shares!.values()]);
    expect(consumed).toBe(total);
    expect(result.shares!.has("vee")).toBe(true); // payer shared daal + naan

    // sharesToDebts drops the payer's own share; debts sum to total minus it.
    const debts = sharesToDebts(result.shares!, "vee");
    expect(debts.every((d) => d.debtor !== "vee" && d.creditor === "vee")).toBe(true);
    const owedUsdc = sum(debts.map((d) => d.amount));
    const expectedUsdc = (total - result.shares!.get("vee")!) * 10_000n; // fiat 2dp -> USDC 6dp
    expect(owedUsdc).toBe(expectedUsdc);
    console.log(
      `shares: ${[...result.shares!.entries()].map(([id, v]) => `${id}=${v}`).join(", ")} (total ${total}); debts: ${debts.map((d) => `${d.debtor}->${d.creditor}=${d.amount}`).join(", ")}`,
    );
  }, 120000);
});
