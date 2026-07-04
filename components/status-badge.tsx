import { cn } from "@/lib/utils";

export type ProjectStatus =
  | "setup"
  | "researching"
  | "research_ready"
  | "prompting"
  | "prompts_ready"
  | "generating"
  | "done";

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; dot: string; pulse?: boolean }
> = {
  setup: { label: "Setup", dot: "bg-zinc-400" },
  researching: { label: "Researching", dot: "bg-sky-400", pulse: true },
  research_ready: { label: "Brand DNA ready", dot: "bg-sky-400" },
  prompting: { label: "Preparing ads", dot: "bg-violet-400", pulse: true },
  prompts_ready: { label: "Ready to generate", dot: "bg-violet-400" },
  generating: { label: "Generating", dot: "bg-amber-400", pulse: true },
  done: { label: "Done", dot: "bg-emerald-400" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.setup;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs text-secondary-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          config.dot,
          config.pulse && "animate-pulse",
        )}
      />
      {config.label}
    </span>
  );
}

/** The workspace route a project should open on, given its status. */
export function statusRoute(status: ProjectStatus): string {
  switch (status) {
    case "setup":
      return "setup";
    case "researching":
    case "research_ready":
      return "brand-dna";
    case "prompting":
    case "prompts_ready":
      return "prompts";
    case "generating":
      return "generate";
    case "done":
      return "gallery";
  }
}
