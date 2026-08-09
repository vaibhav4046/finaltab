import { describe, it, expect } from "vitest";
import { analyzeImageQuality } from "../src/imageQuality.js";

describe("imageQuality", () => {
  it("returns ImageQualityResult with valid structure", async () => {
    const testBuffer = Buffer.from("test");
    const result = await analyzeImageQuality(testBuffer, "image/png");

    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("sharpnessScore");
    expect(result).toHaveProperty("isBlurry");
    expect(["PASS", "WARN_BLURRY", "WARN_UNDEREXPOSED"]).toContain(result.recommendation);
    expect(result.sharpnessScore).toBeGreaterThanOrEqual(0);
    expect(result.sharpnessScore).toBeLessThanOrEqual(100);
  });

  it("gracefully handles any buffer", async () => {
    const emptyBuffer = Buffer.alloc(0);
    const result = await analyzeImageQuality(emptyBuffer, "image/png");

    expect(result.isBlurry).toBe(false);
    expect(result.recommendation).toBe("PASS");
  });
});
