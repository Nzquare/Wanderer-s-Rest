"use client";

/**
 * Reads an image file, downscales it to fit within `maxDimension` (keeping
 * aspect ratio — never upscales a smaller image), and returns it as a PNG
 * data URI. Used for the café logo upload (§Logo upload) instead of
 * standing up a real file-storage service: the data URI is stored directly
 * as the same `logoUrl` string every logo consumer already reads via a
 * plain `<img src>`, no new API route or storage credentials needed.
 * Resizing first keeps that stored string (and every settings fetch that
 * carries it) reasonably small regardless of what the staff member
 * actually uploaded.
 */
export function fileToResizedDataUrl(file: File, maxDimension = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image file."));
    };
    img.src = objectUrl;
  });
}
