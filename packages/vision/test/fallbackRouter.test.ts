import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Real cascade coverage for Groq → Claude → OpenAI.
 *
 * An earlier version of this file contained two tests that asserted nothing
 * about the router: one checked `expect(extractReceiptWithFallback).toBeDefined()`
 * under the name "succeeds on Groq", and one built a local object literal and
 * asserted the literal had the properties it had just been given. Both would
 * have passed if the router body were `throw new Error()`.
 *
 * Only the Groq leg is ever exercised against a live API (it is the only
 * provider key configured). The Claude and OpenAI legs are covered here by
 * mocking each SDK at the module boundary and driving the real router, so a
 * regression in the fallback order or in a provider's response unwrapping is
 * caught without needing three paid keys.
 */

const mocks = vi.hoisted(() => ({
  groqComplete: vi.fn(),
  claudeCreate: vi.fn(),
  openaiCreate: vi.fn(),
}));

vi.mock("../src/groqClient.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/groqClient.js")>();
  return {
    ...actual,
    GroqClient: vi.fn(() => ({ completeJson: mocks.groqComplete })),
  };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: mocks.claudeCreate } })),
}));

vi.mock("openai", () => ({
  default: vi.fn(() => ({ chat: { completions: { create: mocks.openaiCreate } } })),
}));

const { extractReceiptWithFallback } = await import("../src/fallbackRouter.js");

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

const RECEIPT_JSON = JSON.stringify(validReceipt);

/** All three keys present, so provider selection is decided by success, not by config. */
const ALL_KEYS = {
  groqApiKey: "groq-test",
  claudeApiKey: "claude-test",
  openaiApiKey: "openai-test",
};

const claudeOk = () => ({ content: [{ type: "text", text: RECEIPT_JSON }] });
const openaiOk = () => ({ choices: [{ message: { content: RECEIPT_JSON } }] });

beforeEach(() => {
  mocks.groqComplete.mockReset();
  mocks.claudeCreate.mockReset();
  mocks.openaiCreate.mockReset();
});

describe("provider cascade", () => {
  it("returns on Groq and never touches the paid providers", async () => {
    mocks.groqComplete.mockResolvedValue(RECEIPT_JSON);

    const result = await extractReceiptWithFallback(PNG_1PX, ALL_KEYS);

    expect(result.provider).toBe("groq");
    expect(result.receipt.merchant).toBe("Dishoom");
    expect(result.receipt.total).toBe("42.13");
    expect(mocks.claudeCreate).not.toHaveBeenCalled();
    expect(mocks.openaiCreate).not.toHaveBeenCalled();
  });

  it("falls through to Claude when Groq fails, and stops there", async () => {
    mocks.groqComplete.mockRejectedValue(new Error("groq 500"));
    mocks.claudeCreate.mockResolvedValue(claudeOk());

    const result = await extractReceiptWithFallback(PNG_1PX, ALL_KEYS);

    expect(result.provider).toBe("claude");
    expect(result.receipt.merchant).toBe("Dishoom");
    expect(mocks.claudeCreate).toHaveBeenCalledTimes(1);
    expect(mocks.openaiCreate).not.toHaveBeenCalled();
  });

  it("falls through to OpenAI when both Groq and Claude fail", async () => {
    mocks.groqComplete.mockRejectedValue(new Error("groq 500"));
    mocks.claudeCreate.mockRejectedValue(new Error("anthropic 529"));
    mocks.openaiCreate.mockResolvedValue(openaiOk());

    const result = await extractReceiptWithFallback(PNG_1PX, ALL_KEYS);

    expect(result.provider).toBe("openai");
    expect(result.receipt.merchant).toBe("Dishoom");
  });

  it("throws when every provider fails, rather than returning a partial receipt", async () => {
    mocks.groqComplete.mockRejectedValue(new Error("groq 500"));
    mocks.claudeCreate.mockRejectedValue(new Error("anthropic 529"));
    mocks.openaiCreate.mockRejectedValue(new Error("openai 503"));

    await expect(extractReceiptWithFallback(PNG_1PX, ALL_KEYS)).rejects.toThrow(
      /failed on all providers/i,
    );
  });

  it("skips a provider whose key is absent instead of erroring on it", async () => {
    mocks.claudeCreate.mockResolvedValue(claudeOk());

    const result = await extractReceiptWithFallback(PNG_1PX, {
      groqApiKey: undefined,
      claudeApiKey: "claude-test",
      openaiApiKey: undefined,
    });

    expect(result.provider).toBe("claude");
    expect(mocks.groqComplete).not.toHaveBeenCalled();
    expect(mocks.openaiCreate).not.toHaveBeenCalled();
  });

  it("throws a configured-nothing error when no keys are supplied", async () => {
    await expect(
      extractReceiptWithFallback(PNG_1PX, {
        groqApiKey: undefined,
        claudeApiKey: undefined,
        openaiApiKey: undefined,
      }),
    ).rejects.toThrow(/no keys configured/);
  });
});

describe("schema enforcement is what triggers fallback, not just transport errors", () => {
  it("moves to the next provider when Groq returns well-formed JSON that fails the schema", async () => {
    // HTTP 200, parseable JSON, wrong shape: `total` missing. A router that only
    // caught transport errors would hand this straight to the money engine.
    mocks.groqComplete.mockResolvedValue(JSON.stringify({ merchant: "Dishoom", items: [] }));
    mocks.claudeCreate.mockResolvedValue(claudeOk());

    const result = await extractReceiptWithFallback(PNG_1PX, ALL_KEYS);

    expect(result.provider).toBe("claude");
    expect(mocks.groqComplete).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS self-correction first
  });

  it("retries the same provider before falling through", async () => {
    mocks.groqComplete
      .mockResolvedValueOnce("not json at all")
      .mockResolvedValueOnce(RECEIPT_JSON);

    const result = await extractReceiptWithFallback(PNG_1PX, ALL_KEYS);

    expect(result.provider).toBe("groq");
    expect(result.attempts).toBe(2);
    expect(mocks.claudeCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-text Claude response instead of coercing it", async () => {
    mocks.groqComplete.mockRejectedValue(new Error("groq 500"));
    mocks.claudeCreate.mockResolvedValue({ content: [{ type: "tool_use", id: "x" }] });
    mocks.openaiCreate.mockResolvedValue(openaiOk());

    const result = await extractReceiptWithFallback(PNG_1PX, ALL_KEYS);

    expect(result.provider).toBe("openai");
  });

  it("rejects a non-string OpenAI response instead of coercing it", async () => {
    mocks.groqComplete.mockRejectedValue(new Error("groq 500"));
    mocks.claudeCreate.mockRejectedValue(new Error("anthropic 529"));
    mocks.openaiCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

    await expect(extractReceiptWithFallback(PNG_1PX, ALL_KEYS)).rejects.toThrow(
      /failed on all providers/i,
    );
  });
});

describe("provider-independent contract", () => {
  it("returns the identical result shape and receipt from all three providers", async () => {
    mocks.groqComplete.mockResolvedValue(RECEIPT_JSON);
    const viaGroq = await extractReceiptWithFallback(PNG_1PX, ALL_KEYS);

    mocks.groqComplete.mockRejectedValue(new Error("groq 500"));
    mocks.claudeCreate.mockResolvedValue(claudeOk());
    const viaClaude = await extractReceiptWithFallback(PNG_1PX, ALL_KEYS);

    mocks.claudeCreate.mockRejectedValue(new Error("anthropic 529"));
    mocks.openaiCreate.mockResolvedValue(openaiOk());
    const viaOpenAI = await extractReceiptWithFallback(PNG_1PX, ALL_KEYS);

    expect([viaGroq.provider, viaClaude.provider, viaOpenAI.provider]).toEqual([
      "groq",
      "claude",
      "openai",
    ]);

    // Same keys, and the receipt itself is byte-identical whichever provider won.
    const shape = (r: typeof viaGroq) => Object.keys(r).sort();
    expect(shape(viaClaude)).toEqual(shape(viaGroq));
    expect(shape(viaOpenAI)).toEqual(shape(viaGroq));
    expect(viaClaude.receipt).toEqual(viaGroq.receipt);
    expect(viaOpenAI.receipt).toEqual(viaGroq.receipt);
  });

  it("rejects a non-data-URL before contacting any provider", async () => {
    await expect(
      extractReceiptWithFallback("https://example.com/image.jpg", ALL_KEYS),
    ).rejects.toThrow(/data URL/);

    expect(mocks.groqComplete).not.toHaveBeenCalled();
    expect(mocks.claudeCreate).not.toHaveBeenCalled();
    expect(mocks.openaiCreate).not.toHaveBeenCalled();
  });
});
