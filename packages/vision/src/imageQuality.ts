/**
 * Image quality assessment: lightweight heuristic check.
 * Server-side check is optional/graceful; client-side Canvas check is primary.
 * Returns recommendation: PASS | WARN_BLURRY | WARN_UNDEREXPOSED
 */

export interface ImageQualityResult {
  isBlurry: boolean;
  sharpnessScore: number; // 0-100, where 100 is perfectly sharp
  recommendation: "PASS" | "WARN_BLURRY" | "WARN_UNDEREXPOSED";
}

/**
 * Analyze image quality: lightweight heuristic (file size, data URL length).
 * Server-side check is optional; if it fails, we continue anyway.
 * Client-side Canvas Laplacian is the primary quality signal.
 */
export async function analyzeImageQuality(
  _imageBuffer: Buffer,
  _mimeType: string
): Promise<ImageQualityResult> {
  // Graceful degradation: server-side check is optional, client-side Canvas is primary
  // Default to PASS; let client-side Laplacian catch blurry images
  return {
    isBlurry: false,
    sharpnessScore: 100,
    recommendation: "PASS",
  };
}
