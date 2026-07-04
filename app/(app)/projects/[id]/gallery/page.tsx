"use client";

import { useMutation, useQuery } from "convex/react";
import {
  Download,
  Eye,
  ImageIcon,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";

type GalleryImage = {
  _id: Id<"images">;
  _creationTime: number;
  promptId: Id<"prompts">;
  templateName: string;
  promptText: string;
  aspectRatio: string;
  width: number;
  height: number;
  url: string | null;
};

async function downloadImage(image: GalleryImage) {
  if (!image.url) return;
  try {
    const response = await fetch(image.url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${image.templateName}-${image._id.slice(-6)}.png`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    toast.error("Download failed.");
  }
}

export default function GalleryPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });
  const images = useQuery(api.images.gallery, { projectId });
  const jobs = useQuery(api.generation.jobsForProject, { projectId });
  const viewer = useQuery(api.users.viewer);
  const regenerateOne = useMutation(api.generation.regenerateOne);

  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);

  const generating = project?.status === "generating";
  const remaining = useMemo(
    () =>
      (jobs ?? []).filter(
        (job) => job.status === "queued" || job.status === "running",
      ).length,
    [jobs],
  );

  const groups = useMemo(() => {
    const map = new Map<string, GalleryImage[]>();
    for (const image of images ?? []) {
      const list = map.get(image.templateName) ?? [];
      list.push(image);
      map.set(image.templateName, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [images]);

  function regenerate(image: GalleryImage) {
    regenerateOne({ promptId: image.promptId })
      .then(() => toast.success(`Regenerating “${image.templateName}”…`))
      .catch((error) => toast.error(errorMessage(error)));
  }

  if (project === undefined || images === undefined) {
    return <Skeleton className="h-64 rounded-lg" />;
  }
  if (project === null) return null;

  return (
    <div className="space-y-6">
      {generating && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>
            Generation in progress — images appear here as they finish.
          </span>
          {remaining > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {remaining} remaining
            </span>
          )}
        </div>
      )}

      {images.length === 0 && !generating ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <ImageIcon className="mb-3 size-8 text-muted-foreground/50" />
          <p className="mb-1 text-sm font-medium">No images yet</p>
          <p className="mb-4 max-w-sm text-sm text-muted-foreground">
            Run generation to fill this gallery with finished ads.
          </p>
          <Button asChild size="sm">
            <Link href={`/projects/${projectId}/generate`}>
              Go to Generate
            </Link>
          </Button>
        </div>
      ) : (
        groups.map(([templateName, groupImages]) => (
          <section key={templateName}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {templateName}
              <span className="text-xs font-normal text-muted-foreground">
                {groupImages.length}
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {groupImages.map((image) => (
                <figure
                  key={image._id}
                  className="group relative overflow-hidden rounded-lg border border-border bg-card"
                >
                  {image.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.url}
                      alt={image.templateName}
                      className="w-full cursor-zoom-in"
                      onClick={() => setLightbox(image)}
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                  <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
                    <Badge
                      variant="outline"
                      className="h-4.5 border-white/20 px-1.5 text-[10px] text-white/80"
                    >
                      {image.aspectRatio}
                    </Badge>
                    <span className="pointer-events-auto flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Download"
                        className="size-7 text-white hover:bg-white/20 hover:text-white"
                        onClick={() => void downloadImage(image)}
                      >
                        <Download className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View details"
                        className="size-7 text-white hover:bg-white/20 hover:text-white"
                        onClick={() => setLightbox(image)}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Regenerate this one"
                        className="size-7 text-white hover:bg-white/20 hover:text-white"
                        onClick={() => regenerate(image)}
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))
      )}

      <Dialog
        open={lightbox !== null}
        onOpenChange={(open) => !open && setLightbox(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {lightbox && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {lightbox.templateName}
                  <Badge
                    variant="outline"
                    className="h-4.5 px-1.5 text-[10px] text-muted-foreground"
                  >
                    {lightbox.width}×{lightbox.height}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Generated {new Date(lightbox._creationTime).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              {lightbox.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lightbox.url}
                  alt={lightbox.templateName}
                  className="mx-auto max-h-[55vh] w-auto rounded-lg border border-border"
                />
              )}
              {viewer?.isAdmin && (
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Prompt used (admin only)
                  </p>
                  <p className="max-h-32 overflow-y-auto text-xs leading-relaxed text-foreground/90">
                    {lightbox.promptText}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void downloadImage(lightbox)}
                >
                  <Download className="size-3.5" />
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => {
                    regenerate(lightbox);
                    setLightbox(null);
                  }}
                >
                  <RefreshCw className="size-3.5" />
                  Regenerate
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
