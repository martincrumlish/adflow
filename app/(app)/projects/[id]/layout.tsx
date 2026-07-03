"use client";

import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StatusBadge, type ProjectStatus } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STEPS = [
  { slug: "setup", label: "Setup" },
  { slug: "brand-dna", label: "Brand DNA" },
  { slug: "prompts", label: "Prompts" },
  { slug: "generate", label: "Generate" },
  { slug: "gallery", label: "Gallery" },
] as const;

/** How far the project has progressed, as a step count (1-5). */
function statusRank(status: ProjectStatus): number {
  switch (status) {
    case "setup":
      return 1;
    case "researching":
    case "research_ready":
      return 2;
    case "prompting":
    case "prompts_ready":
      return 3;
    case "generating":
      return 4;
    case "done":
      return 5;
  }
}

export default function ProjectLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const projectId = params.id as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });

  const rank = project ? statusRank(project.status) : 1;

  return (
    <div className="mx-auto max-w-5xl px-8 py-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {project === undefined ? (
            <>
              <Skeleton className="mb-2 h-6 w-56" />
              <Skeleton className="h-4 w-40" />
            </>
          ) : project === null ? (
            <h1 className="text-lg font-semibold">Project not found</h1>
          ) : (
            <>
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {project.name}
              </h1>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {project.brandName} · {project.productName}
                </span>
                <a
                  href={project.brandUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                </a>
              </p>
            </>
          )}
        </div>
        {project && <StatusBadge status={project.status} />}
      </div>

      <nav className="mb-6 flex items-center gap-1 border-b border-border">
        {STEPS.map((step, index) => {
          const href = `/projects/${projectId}/${step.slug}`;
          const active = pathname === href;
          const reached = index < rank;
          return (
            <Link
              key={step.slug}
              href={href}
              className={cn(
                "relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-4.5 items-center justify-center rounded-full text-[10px] font-medium",
                  active
                    ? "bg-primary text-primary-foreground"
                    : reached
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-muted text-muted-foreground/60",
                )}
              >
                {index + 1}
              </span>
              {step.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
