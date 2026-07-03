"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import {
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Plus,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/logo";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { statusRoute, type ProjectStatus } from "@/components/status-badge";

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}

const STATUS_DOT: Record<ProjectStatus, string> = {
  setup: "bg-zinc-500",
  researching: "bg-sky-400 animate-pulse",
  research_ready: "bg-sky-400",
  prompting: "bg-violet-400 animate-pulse",
  prompts_ready: "bg-violet-400",
  generating: "bg-amber-400 animate-pulse",
  done: "bg-emerald-400",
};

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const viewer = useQuery(api.users.viewer);
  const projects = useQuery(api.projects.list);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between p-4 pb-3">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>
      <div className="px-3 pb-2">
        <NewProjectDialog>
          <Button size="sm" className="w-full justify-start gap-2">
            <Plus className="size-4" />
            New Project
          </Button>
        </NewProjectDialog>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        <div className="space-y-0.5">
          <NavLink href="/dashboard" active={pathname === "/dashboard"}>
            <LayoutDashboard className="size-4" />
            Dashboard
          </NavLink>
          <NavLink href="/templates" active={pathname === "/templates"}>
            <LayoutTemplate className="size-4" />
            Templates
          </NavLink>
          {viewer?.isAdmin && (
            <NavLink href="/admin" active={pathname.startsWith("/admin")}>
              <ShieldCheck className="size-4" />
              Admin
            </NavLink>
          )}
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            <FolderKanban className="size-3" />
            Projects
          </p>
          {projects === undefined ? (
            <div className="space-y-1.5 px-2 py-1">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ) : projects.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground/60">
              No projects yet
            </p>
          ) : (
            <div className="space-y-0.5">
              {projects.map((project) => (
                <NavLink
                  key={project._id}
                  href={`/projects/${project._id}/${statusRoute(project.status)}`}
                  active={pathname.startsWith(`/projects/${project._id}`)}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      STATUS_DOT[project.status],
                    )}
                  />
                  <span className="truncate">{project.name}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">
              {viewer?.email ?? "…"}
            </p>
            {viewer?.planName && (
              <p className="truncate text-[11px] text-muted-foreground">
                {viewer.planName} plan
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              title="Sign out"
              onClick={() => void signOut().then(() => router.push("/signin"))}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
