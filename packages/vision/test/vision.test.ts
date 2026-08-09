import { describe, it, expect } from "vitest";
import { GroqClient, GroqApiError, extractJsonObject } from "../src/groqClient.js";
import { parseReceiptImage } from "../src/parseReceipt.js";
import { proposeAllocation } from "../src/proposeAllocation.js";
import type { ParsedReceipt } from "@finaltab/engine";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const validReceipt = {
  merchant: "Dishoom",
  date: "2026-08-01",
  currency: "GBP",
  items: [
    { description: "House Black Daal", quantity: 1, unitPrice: "8.50", lineTotal: "8.50" },
    { description: "Chicken Ruby", quantity: 2, unitPrice: "14.90", lineTotal: "29.80" },
  ],
  subtotal: "38.30",
  tax: null,
  tip: "3.83",
  serviceCharge: null,
  total: "42.13",
  confidence: 0.95,
};

/** fetch stub that returns queued Groq-shaped chat completions. */
function groqFetch(outputs: Array<string | { status: number; body: unknown }>): typeof fetch {
  let i = 0;
  return (async () => {
    const out = outputs[Math.min(i++, outputs.length - 1)]!;
    if (typeof out !== "string") {
      return new Response(JSON.stringify(out.body), { status: out.status });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: out } }] }),
      { status: 200 },
    );
  }) as typeof fetch;
}

function client(outputs: Array<string | { status: number; body: unknown }>): GroqClient {
  return new GroqClient({ apiKey: "gsk_test", fetchImpl: groqFetch(outputs) });
}

describe("extractJsonObject", () => {
  it("passes through raw JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });
  it("unwraps ```json fences", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("extracts object from surrounding prose", () => {
    expect(extractJsonObject('Here you go: {"a":1} hope that helps')).toEqual({ a: 1 });
  });
  it("throws when no object present", () => {
    expect(() => extractJsonObject("no json here")).toThrow(/no JSON object/);
  });
});

describe("parseReceiptImage", () => {
  it("valid output first try -> attempts 1, Zod-typed receipt", async () => {
    const res = await parseReceiptImage(client([JSON.stringify(validReceipt)]), PNG_1PX);
    expect(res.attempts).toBe(1);
    expect(res.receipt.merchant).toBe("Dishoom");
    expect(res.receipt.items).toHaveLength(2);
  });

  it("fenced output still parses", async () => {
    const res = await parseReceiptImage(client(["```json\n" + JSON.stringify(validReceipt) + "\n```"]), PNG_1PX);
    expect(res.receipt.total).toBe("42.13");
  });

  it("invalid then corrected -> attempts 2 with error fed back", async () => {
    const bad = JSON.stringify({ ...validReceipt, total: 42.13 }); // number, schema wants string
    const res = await parseReceiptImage(client([bad, JSON.stringify(validReceipt)]), PNG_1PX);
    expect(res.attempts).toBe(2);
  });

  it("invalid twice -> throws with schema detail, never returns garbage", async () => {
    const bad = JSON.stringify({ merchant: "x" });
    await expect(parseReceiptImage(client([bad, bad]), PNG_1PX)).rejects.toThrow(/failed after 2 attempts/);
  });

  it("rejects non-data-URL input before any network call", async () => {
    await expect(parseReceiptImage(client([]), "https://example.com/r.png")).rejects.toThrow(/data URL/);
  });

  it("HTTP 500 -> GroqApiError with status", async () => {
    const err = await parseReceiptImage(client([{ status: 500, body: { error: "boom" } }]), PNG_1PX).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(GroqApiError);
    expect(err.httpStatus).toBe(500);
  });

  it("money amounts with 3 decimals are rejected by schema", async () => {
    const bad = JSON.stringify({
      ...validReceipt,
      items: [{ description: "x", quantity: 1, unitPrice: "1.005", lineTotal: "1.005" }],
    });
    await expect(parseReceiptImage(client([bad, bad]), PNG_1PX)).rejects.toThrow();
  });
});

describe("proposeAllocation", () => {
  const receipt = validReceipt as unknown as ParsedReceipt;
  const participants = [
    { id: "p1", name: "Vee" },
    { id: "p2", name: "Hem" },
  ];
  const validProposal = {
    allocations: [
      { itemIndex: 0, participants: ["p1", "p2"] },
      { itemIndex: 1, participants: ["p2"] },
    ],
    payerId: "p1",
    notes: "Daal shared, ruby was Hem's.",
  };

  it("valid proposal first try", async () => {
    const res = await proposeAllocation(client([JSON.stringify(validProposal)]), {
      receipt,
      participants,
      payerId: "p1",
      instruction: "we shared the daal, Hem had the chicken",
    });
    expect(res.attempts).toBe(1);
    expect(res.proposal.allocations).toHaveLength(2);
  });

  it("rejects payerId not in participants before any network call", async () => {
    await expect(
      proposeAllocation(client([]), { receipt, participants, payerId: "ghost", instruction: "x" }),
    ).rejects.toThrow(/not in participants/);
  });

  it("schema-invalid twice -> throws", async () => {
    const bad = JSON.stringify({ allocations: "nope" });
    await expect(
      proposeAllocation(client([bad, bad]), { receipt, participants, payerId: "p1", instruction: "x" }),
    ).rejects.toThrow(/failed after 2 attempts/);
  });
});
