"use client";

import { useRef, useState } from "react";
import { resizeImageFile } from "@/lib/image-resize";

export function PhotoUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await resizeImageFile(file);
      onChange(dataUrl);
    } catch {
      setError("Couldn't process that image — try a different file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-16 w-16 rounded-lg object-cover" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-background text-2xl text-foreground-muted">
          📷
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border-2 border-border px-3 py-2 text-sm font-medium text-foreground hover:border-teal-500 disabled:opacity-50"
        >
          {busy ? "Processing…" : value ? "Change photo" : "Upload photo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {error && <p className="mt-1 text-xs text-status-danger">{error}</p>}
      </div>
    </div>
  );
}
