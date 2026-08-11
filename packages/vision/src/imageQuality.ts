/**
 * Server-side image quality check.
 *
 * NOT IMPLEMENTED. This is a deliberate no-op that always returns PASS.
 *
 * The only real sharpness measurement in this codebase is client-side, in
 * apps/web/lib/imageOptimization.ts, which runs a Laplacian-variance check on a
 * canvas before upload. Nothing here decodes the buffer, so nothing here can
 * measure anything — `sharpnessScore` is null rather than a number, so a caller
 * cannot mistake an unmeasured image for a sharp one.
 *
 * If server-side detection is ever wanted, it needs a decoder (sharp/jimp) and
 * this stub replaced wholesale — do not add a heuristic on buffer length and
 * call it sharpness.
 */

export interface ImageQualityResult {
  isBlurry: boolean;
  /** 0-100, higher is sharper. `null` means no measurement was taken. */
  sharpnessScore: number | null;
  recommendation: "PASS" | "WARN_BLURRY" | "WARN_UNDEREXPOSED";
}

/**
 * Always returns PASS without inspecting the image.
 *
 * Kept as a seam so the vision route has one place to call once real
 * server-side analysis exists. Callers must treat PASS as "not checked", not
 * as "checked and fine".
 */
export async function analyzeImageQuality(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ImageQualityResult> {
  void imageBuffer;
  void mimeType;
  return {
    isBlurry: false,
    sharpnessScore: null,
    recommendation: "PASS",
  };
}
