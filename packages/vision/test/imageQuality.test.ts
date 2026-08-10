import { describe, it, expect } from "vitest";
import { analyzeImageQuality } from "../src/imageQuality.js";

/**
 * analyzeImageQuality is an unimplemented no-op. These tests pin that contract
 * so it stays visible: they assert the stub reports "not measured" rather than
 * pretending it verified anything. They are NOT blur-detection coverage — the
 * only real sharpness check lives client-side in
 * apps/web/lib/imageOptimization.ts and has no test runner in that workspace.
 */
describe("imageQuality (unimplemented server-side stub)", () => {
  it("reports sharpnessScore as null, never a fabricated measurement", async () => {
    const result = await analyzeImageQuality(Buffer.from("test"), "image/png");

    expect(result.sharpnessScore).toBeNull();
  });

  it("returns PASS for any buffer, including an empty one, without decoding it", async () => {
    const empty = await analyzeImageQuality(Buffer.alloc(0), "image/png");
    const garbage = await analyzeImageQuality(Buffer.from([0xff, 0x00, 0xff]), "image/png");

    // Identical output for wildly different input is the point: it proves no
    // inspection happens, so a PASS here carries no information about the image.
    expect(empty).toEqual({ isBlurry: false, sharpnessScore: null, recommendation: "PASS" });
    expect(garbage).toEqual(empty);
  });
});
