import { ClockPanel } from "@/components/pos/clock-panel";

export default function ClockPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Clock In/Out</h1>
      <ClockPanel />
    </div>
  );
}
