"use client";

/**
 * Resizes/compresses an image file entirely client-side and returns a JPEG
 * data URL. This lets "upload a photo" work with zero external storage
 * service (no S3/Blob keys to configure) — the compressed result (usually
 * tens of KB) is stored directly in MenuItem.photoUrl. Good enough for a
 * café menu; revisit with real object storage if photos need to be huge
 * or shared outside the app.
 */
export function resizeImageFile(
  file: File,
  maxDimension = 640,
  quality = 0.75,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
