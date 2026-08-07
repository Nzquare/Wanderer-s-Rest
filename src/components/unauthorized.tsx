import Link from "next/link";

export function Unauthorized() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <p className="text-lg font-semibold text-foreground">
        You don&apos;t have access to this area.
      </p>
      <p className="text-sm text-foreground-muted">
        Ask a Manager or Owner if you think this is wrong.
      </p>
      <Link href="/" className="text-sm text-teal-600">
        Back to app chooser
      </Link>
    </main>
  );
}
