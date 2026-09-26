import { DndSessionsManager } from "@/components/back-office/dnd-sessions-manager";

export default function DndPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">D&D Sessions</h1>
        <p className="text-sm text-foreground-muted">
          Log who ran each game — a one-shot or a numbered campaign session —
          and track the commission it earned the DM.
        </p>
      </div>
      <DndSessionsManager />
    </div>
  );
}
