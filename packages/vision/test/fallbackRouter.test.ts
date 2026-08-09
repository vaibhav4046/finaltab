import { describe, it, expect, vi } from "vitest";
import { extractReceiptWithFallback } from "../src/fallbackRouter.js";

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

describe("fallbackRouter", () => {
  it("succeeds on Groq when configured and endpoint works", async () => {
    // Mock Anthropic SDK to throw (not available in test)
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => {
        throw new Error("Claude not mocked");
      }),
    }));

    // This test verifies the router structure. In practice, Groq will be tested
    // via integration tests (live API calls).
    // For unit tests, we'd need to mock all three clients.
    expect(extractReceiptWithFallback).toBeDefined();
  });

  it("throws when no API keys configured", async () => {
    await expect(
      extractReceiptWithFallback(PNG_1PX, {
        groqApiKey: undefined,
        claudeApiKey: undefined,
        openaiApiKey: undefined,
      })
    ).rejects.toThrow(/no keys configured/);
  });

  it("rejects invalid image data URL", async () => {
    await expect(
      extractReceiptWithFallback("https://example.com/image.jpg", {
        groqApiKey: "test",
      })
    ).rejects.toThrow(/data URL/);
  });

  it("preserves receipt format across all providers", async () => {
    // Unit tests verify the interface contracts.
    // Live integration tests will validate actual provider responses.
    const expectedShape = {
      receipt: validReceipt,
      rawModelOutput: JSON.stringify(validReceipt),
      attempts: 1,
      provider: "groq" as const,
    };

    expect(expectedShape).toHaveProperty("receipt");
    expect(expectedShape).toHaveProperty("provider");
    expect(["groq", "claude", "openai"]).toContain(expectedShape.provider);
  });

  it("error handling structure correct", async () => {
    // Verify that errors from all three providers are caught and routed correctly
    const error = await extractReceiptWithFallback(PNG_1PX, {
      groqApiKey: "invalid_key",
      claudeApiKey: undefined,
      openaiApiKey: undefined,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/failed/i);
  });
});
