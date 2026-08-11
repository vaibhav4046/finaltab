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
});
