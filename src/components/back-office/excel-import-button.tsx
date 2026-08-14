"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ImportResult {
  error?: string;
  errors?: { row: number; message: string }[];
  [key: string]: unknown;
}

/**
 * Shared "Import from Excel" control for Back Office bulk-import screens
 * (Menu, Game Library — see src/app/api/menu/import and
 * src/app/api/games/import). Uploads via plain fetch/FormData rather than
 * tRPC, since these are file uploads handled by Route Handlers, not JSON
 * procedures.
 */
export function ExcelImportButton({
  importUrl,
  templateUrl,
  onImported,
  summaryLabels,
}: {
  importUrl: string;
  templateUrl: string;
  onImported: () => void;
  /** Result keys (e.g. "createdItems") paired with the label to show in the summary line. */
  summaryLabels: { key: string; label: string }[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFile(file: File) {
    setPending(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(importUrl, { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as ImportResult | null;
      if (!data) {
        setResult({ error: `Import failed (HTTP ${res.status}).` });
      } else {
        setResult(data);
        if (!data.error) onImported();
      }
    } catch {
      setResult({ error: "Upload failed — check your connection and try again." });
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Button
          size="md"
          variant="outline"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "Importing…" : "⬆ Import from Excel"}
        </Button>
        <a href={templateUrl} className="text-xs text-teal-600 underline">
          Download template
        </a>
      </div>
      {result && (
        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          {result.error ? (
            <p className="text-status-danger">{result.error}</p>
          ) : (
            <>
              <p className="font-medium text-foreground">
                {summaryLabels.map(({ key, label }) => `${label}: ${result[key] ?? 0}`).join(" · ")}
              </p>
              {Array.isArray(result.errors) && result.errors.length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-status-danger">
                  <p className="font-medium">
                    {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped:
                  </p>
                  {result.errors.map((e, i) => (
                    <p key={i}>
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
