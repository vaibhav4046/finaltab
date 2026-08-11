/**
 * Client-side image quality check before upload.
 * Uses Canvas API for Laplacian edge detection (simplified, no external libs).
 * Returns rough quality estimate + recommendation string.
 */

export interface LocalImageQuality {
  isBlurry: boolean;
  recommendation: string; // Human-readable warning
}

// Phone photos can exceed 12 megapixels. Sharpness is only an advisory signal,
// so analyzing a bounded preview is both faster and substantially less memory
// intensive than allocating RGBA + number[] buffers at native resolution.
const MAX_ANALYSIS_EDGE = 768;
const MAX_UPLOAD_EDGE = 2048;
const MAX_DECODED_PIXELS = 50_000_000;
const KEEP_ORIGINAL_BYTES = 2_500_000;

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the receipt image."));
    reader.readAsDataURL(file);
  });
}

/**
 * Bound the image sent over JSON. Small source images stay byte-for-byte; large
 * camera photos are orientation-corrected by the browser, downsampled, and
 * encoded once at OCR-friendly quality.
 */
export async function prepareReceiptImage(file: File): Promise<string> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("Could not decode the receipt image."));
      candidate.src = imageUrl;
    });
    const decodedPixels = img.naturalWidth * img.naturalHeight;
    if (!Number.isSafeInteger(decodedPixels) || decodedPixels > MAX_DECODED_PIXELS) {
      throw new Error("That image is too large to process safely. Crop it and try again.");
    }
    if (Math.max(img.naturalWidth, img.naturalHeight) <= MAX_UPLOAD_EDGE && file.size <= KEEP_ORIGINAL_BYTES) {
      return await fileAsDataUrl(file);
    }

    const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the receipt image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

/**
 * Check local image quality via Canvas Laplacian analysis.
 * Non-blocking warning only — user can override and proceed.
 */
export async function checkLocalImageQuality(file: File): Promise<LocalImageQuality> {
  return new Promise((resolve) => {
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    const finish = (quality: LocalImageQuality) => {
      URL.revokeObjectURL(imageUrl);
      resolve(quality);
    };

    img.onload = () => {
      try {
        finish(analyzeCanvasQuality(img));
      } catch (e) {
        // Quality check failed; assume OK and proceed.
        console.warn("[image-optimization] quality check error:", e);
        finish({ isBlurry: false, recommendation: "" });
      }
    };

    img.onerror = () => {
      finish({ isBlurry: false, recommendation: "" });
    };

    try {
      img.src = imageUrl;
    } catch {
      URL.revokeObjectURL(imageUrl);
      resolve({ isBlurry: false, recommendation: "" });
    }
  });
}

/**
 * Analyze image sharpness via Canvas and Laplacian edge detection.
 * Returns { isBlurry, recommendation string }.
 */
function analyzeCanvasQuality(img: HTMLImageElement): LocalImageQuality {
  const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { isBlurry: false, recommendation: "" };
  }

  ctx.drawImage(img, 0, 0, width, height);

  // Get grayscale pixel data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const pixels = new Uint8Array(width * height);

  for (let i = 0, pixelIndex = 0; i < data.length; i += 4, pixelIndex += 1) {
    // Convert RGBA to grayscale (R channel after greyscale)
    const gray = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    pixels[pixelIndex] = gray;
  }

  // Calculate Laplacian variance
  const laplacianVariance = calculateLaplacianVariance(pixels, width, height);

  // Threshold 100 is the conventional cv2.Laplacian(...).var() cutoff, so the
  // metric above must be that same quantity — see calculateLaplacianVariance.
  // Measured on the bundled receipt fixture: 4149.8 sharp, 242.1 at 1px blur,
  // 14.2 at 2px blur. Note the metric is resolution-dependent, so this is a
  // soft warning only and never blocks the upload.
  const isBlurry = laplacianVariance < 100;

  let recommendation = "";
  if (isBlurry) {
    recommendation = "This image looks blurry. Better lighting or focus might help, but we'll try anyway.";
  }

  return { isBlurry, recommendation };
}

/**
 * Variance of the signed Laplacian — the standard sharpness metric, equivalent
 * to cv2.Laplacian(img, CV_64F).var().
 *
 * This previously took Math.abs of each response and returned Math.sqrt of the
 * variance, which is a standard deviation of a rectified signal: a different
 * quantity on a much smaller scale than the 100 threshold it was compared
 * against. The effect was that every image scored below 100 — the pristine
 * bundled fixture measured 62.7 — so the "looks blurry" warning fired
 * unconditionally and carried no information.
 */
function calculateLaplacianVariance(pixels: Uint8Array, width: number, height: number): number {
  let count = 0;
  let total = 0;
  let totalSquares = 0;

  // Apply Laplacian kernel at interior pixels
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const top = pixels[idx - width]!;
      const bottom = pixels[idx + width]!;
      const left = pixels[idx - 1]!;
      const right = pixels[idx + 1]!;
      const center = pixels[idx]!;

      // Laplacian = -4*center + (top + bottom + left + right)
      const value = -4 * center + top + bottom + left + right;
      count += 1;
      total += value;
      totalSquares += value * value;
    }
  }

  if (count === 0) return 0;
  const mean = total / count;
  return Math.max(0, totalSquares / count - mean * mean);
}
