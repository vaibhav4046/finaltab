import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateReceiptUpload } from "@/components/ReceiptPanel";

const image = (type: string, size: number) => ({ type, size });

describe("receipt upload validation", () => {
  it("requires explicit provider consent before accepting a pasted image", () => {
    expect(validateReceiptUpload(image("image/png", 128), false)).toBe(
      "Confirm the receipt-processing consent before uploading.",
    );
  });

  it.each(["image/png", "image/jpeg", "image/webp"])("accepts bounded %s input", (type) => {
    expect(validateReceiptUpload(image(type, 10 * 1024 * 1024), true)).toBeNull();
  });

  it("rejects non-image clipboard data", () => {
    expect(validateReceiptUpload(image("text/plain", 128), true)).toBe(
      "Use a PNG, JPEG, or WebP image.",
    );
  });

  it("rejects images over the ten-megabyte boundary", () => {
    expect(validateReceiptUpload(image("image/png", 10 * 1024 * 1024 + 1), true)).toBe(
      "That image is over 10 MB. Crop or compress it first.",
    );
  });

  it("keeps restored receipts gated by visible, one-shot replacement consent", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/ReceiptPanel.tsx", import.meta.url)), "utf8");
    const restoredReceiptControlsStart = source.indexOf("{receipt && parsed && !draft ? (");
    expect(restoredReceiptControlsStart).toBeGreaterThanOrEqual(0);
    const restoredReceiptControls = source.slice(restoredReceiptControlsStart);

    expect(restoredReceiptControls).toContain(
      "I consent to sending the next replacement image to the configured vision provider for extraction.",
    );
    expect(restoredReceiptControls).toContain("checked={consent}");
    expect(restoredReceiptControls).toContain("disabled={busy || locked}");
    expect(restoredReceiptControls).toContain("disabled={busy || locked || !consent}");
    expect(source).toMatch(/onReceipt\(\{[\s\S]*?imageDataUrl: "",[\s\S]*?\}\);\s*\/\/ Provider consent is one-shot:[\s\S]*?setConsent\(false\);/);
  });
});
