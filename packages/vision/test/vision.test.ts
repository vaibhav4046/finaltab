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

  it("invalid every attempt -> throws with schema detail, never returns garbage", async () => {
    const bad = JSON.stringify({ merchant: "x" });
    await expect(parseReceiptImage(client([bad, bad, bad]), PNG_1PX)).rejects.toThrow(/failed after 3 attempts/);
  });

  it("retryable 400 (json_validate_failed) then valid -> succeeds on attempt 2", async () => {
    const res = await parseReceiptImage(
      client([
        { status: 400, body: { error: { code: "json_validate_failed", message: "output was not valid JSON" } } },
        JSON.stringify(validReceipt),
      ]),
      PNG_1PX,
    );
    expect(res.attempts).toBe(2);
    expect(res.receipt.merchant).toBe("Dishoom");
  });

  it("401 is never retried -> immediate GroqApiError", async () => {
    let calls = 0;
    const counting = (async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 });
    }) as typeof fetch;
    const err = await parseReceiptImage(
      new GroqClient({ apiKey: "gsk_test", fetchImpl: counting }),
      PNG_1PX,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(GroqApiError);
    expect(err.httpStatus).toBe(401);
    expect(calls).toBe(1);
  });

  it("Groq error body detail lands in the error message", async () => {
    const err = await parseReceiptImage(
      client([{ status: 403, body: { error: { code: "permission_denied", message: "no access to model" } } }]),
      PNG_1PX,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(GroqApiError);
    expect(String(err.message)).toMatch(/permission_denied: no access to model/);
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

  it("schema-invalid every attempt -> throws", async () => {
    const bad = JSON.stringify({ allocations: "nope" });
    await expect(
      proposeAllocation(client([bad, bad, bad]), { receipt, participants, payerId: "p1", instruction: "x" }),
    ).rejects.toThrow(/failed after 3 attempts/);
  });

  it("surfaces a 429 once instead of retrying inside the same cooldown", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ error: { code: "rate_limit_exceeded", message: "slow down" } }),
        { status: 429 },
      );
    }) as typeof fetch;
    await expect(
      proposeAllocation(new GroqClient({ apiKey: "gsk_test", fetchImpl }), {
        receipt,
        participants,
        payerId: "p1",
        instruction: "x",
      }),
    ).rejects.toMatchObject({ httpStatus: 429 });
    expect(calls).toBe(1);
  });

  it("sends only allocation-relevant item fields to the advisory model", async () => {
    let body = "";
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validProposal) } }] }), {
        status: 200,
      });
    }) as typeof fetch;
    await proposeAllocation(new GroqClient({ apiKey: "gsk_test", fetchImpl }), {
      receipt,
      participants,
      payerId: "p1",
      instruction: "split it",
    });
    const request = JSON.parse(body) as { messages: Array<{ role: string; content: string }> };
    const payload = request.messages.find((message) => message.role === "user")?.content ?? "";
    expect(payload).toContain('"itemIndex":0');
    expect(payload).toContain('"quantity":1');
    expect(payload).not.toContain("\n");
    expect(payload).not.toContain("unitPrice");
    expect(payload).not.toContain("lineTotal");
    expect(payload).not.toContain('"currency"');
  });

  it("retains provider-reported usage across schema retries", async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      const content = call === 1 ? JSON.stringify({ allocations: "invalid" }) : JSON.stringify(validProposal);
      return new Response(JSON.stringify({
        model: "usage-test-model",
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }), { status: 200 });
    }) as typeof fetch;
    const res = await proposeAllocation(new GroqClient({ apiKey: "gsk_test", fetchImpl }), {
      receipt,
      participants,
      payerId: "p1",
      instruction: "x",
    });
    expect(res.attempts).toBe(2);
    expect(res.model).toBe("usage-test-model");
    expect(res.usage).toEqual({ promptTokens: 20, completionTokens: 10, totalTokens: 30 });
  });
});

describe("Groq request bounds", () => {
  it("sets a provider-side completion token cap", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
    }) as typeof fetch;
    await new GroqClient({ apiKey: "gsk_test", fetchImpl, maxCompletionTokens: 999999 })
      .completeJson([{ role: "user", content: "bounded" }]);
    expect(requestBody).toMatchObject({ max_completion_tokens: 8192 });
  });
});
