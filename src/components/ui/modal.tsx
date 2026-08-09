"use client";

/** Simple centered overlay panel — used for the menu item editor drawer and anywhere else a focused edit view beats inline expansion. */
export function Modal({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        className={`relative my-8 w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl border border-border bg-surface p-5 shadow-xl`}
      >
        {children}
      </div>
    </div>
  );
}
