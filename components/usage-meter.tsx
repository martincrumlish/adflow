"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** "1 Oct", in UTC to match the quota window. */
function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Compact "images this month" meter for the app sidebar. */
export function UsageMeter() {
  const usage = useQuery(api.usage.myUsage);
  if (!usage) return null;

  if (usage.exempt) {
    return (
      <div className="px-5 pb-3">
        <p className="text-[11px] text-muted-foreground">
          {usage.ownKeys
            ? "Images billed to your own keys"
            : `${usage.used.toLocaleString()} ${usage.used === 1 ? "image" : "images"} · Unlimited this month`}
        </p>
      </div>
    );
  }

  const quota = usage.quota ?? 0;
  const percent =
    quota === 0 ? 100 : Math.min(100, Math.round((usage.used / quota) * 100));
  const full = usage.used >= quota;
  const warn = !full && percent >= 80;

  return (
    <div className="space-y-1.5 px-5 pb-3">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">Images this month</span>
        <span
          className={cn(
            "font-medium tabular-nums",
            full && "text-red-500",
            warn && "text-amber-500",
          )}
        >
          {usage.used.toLocaleString()} / {quota.toLocaleString()}
        </span>
      </div>
      <Progress
        value={percent}
        aria-label="Images used this month"
        className={cn(
          full && "[&_[data-slot=progress-indicator]]:bg-red-500",
          warn && "[&_[data-slot=progress-indicator]]:bg-amber-500",
        )}
      />
      <p className="text-[11px] text-muted-foreground/70">
        {full ? "Limit reached · resets" : "Resets"} {shortDate(usage.resetsOn)}
      </p>
    </div>
  );
}
