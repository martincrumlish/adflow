import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("relative z-10 flex items-center gap-2", className)}>
      <span className="flex size-6 items-center justify-center rounded-md bg-primary">
        <Zap className="size-3.5 text-primary-foreground" strokeWidth={2.5} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">AdFlow</span>
    </div>
  );
}
