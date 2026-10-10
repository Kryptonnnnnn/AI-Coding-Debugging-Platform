import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function MetricCard({ label, value, icon: I, hint, testId }: { label: string; value: ReactNode; icon: LucideIcon; hint?: string; testId?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-card">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-2xs font-medium uppercase tracking-wide">{label}</span>
        <I className="h-3.5 w-3.5" aria-hidden />
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums leading-none" data-testid={testId}>{value}</p>
      {hint && <p className="mt-1.5 text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
