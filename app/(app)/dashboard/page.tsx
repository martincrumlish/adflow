"use client";

import { useMutation, useQuery } from "convex/react";
import { FolderPlus, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { StatusBadge, statusRoute } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";

export default function DashboardPage() {
  const projects = useQuery(api.projects.list);
  const removeProject = useMutation(api.projects.remove);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"projects">;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeProject({ projectId: deleteTarget.id });
      toast.success(`Deleted “${deleteTarget.name}”.`);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Each project takes one brand from research to a finished ad
            gallery.
          </p>
        </div>
        <NewProjectDialog>
          <Button size="sm" className="gap-2">
            <Plus className="size-4" />
            New Project
          </Button>
        </NewProjectDialog>
      </div>

      {projects === undefined ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <FolderPlus className="mb-3 size-8 text-muted-foreground/50" />
          <p className="mb-1 text-sm font-medium">No projects yet</p>
          <p className="mb-4 max-w-xs text-sm text-muted-foreground">
            Create your first project to turn a brand into a folder of
            production-ready ads.
          </p>
          <NewProjectDialog>
            <Button size="sm" className="gap-2">
              <Plus className="size-4" />
              New Project
            </Button>
          </NewProjectDialog>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project._id}
              className="group relative rounded-lg border border-border bg-card p-4 transition-colors hover:border-ring/40"
            >
              <Link
                href={`/projects/${project._id}/${statusRoute(project.status)}`}
                className="absolute inset-0"
                aria-label={project.name}
              />
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{project.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {project.brandName} · {project.productName}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative z-10 size-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        setDeleteTarget({ id: project._id, name: project.name })
                      }
                    >
                      <Trash2 className="size-4" />
                      Delete project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center justify-between">
                <StatusBadge status={project.status} />
                <span className="text-[11px] text-muted-foreground">
                  {new Date(project._creationTime).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              This permanently removes the project, its Brand DNA, prompts, and
              every generated image.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
