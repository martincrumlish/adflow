"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  Check,
  Copy,
  ImageIcon,
  Loader2,
  PencilLine,
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  TemplateEditorDialog,
  type EditableTemplate,
} from "@/components/templates/template-editor-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errors";

export default function FormatsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });
  const dna = useQuery(api.brandDna.get, { projectId });
  const templates = useQuery(api.templates.list);
  const setSelected = useMutation(api.projects.setSelectedTemplates);
  const duplicateTemplate = useMutation(api.templates.duplicate);
  const generate = useAction(api.promptGen.run);

  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<EditableTemplate | null>(
    null,
  );
  const [quality, setQuality] = useState<"low" | "medium" | "high">("high");

  // Local-first selection (state + ref) so rapid toggles don't race
  // each other or the server round-trip.
  const [localIds, setLocalIds] = useState<Set<Id<"templates">> | null>(null);
  const selectedRef = useRef<Set<Id<"templates">> | null>(null);
  const selectedIds = useMemo(
    () => localIds ?? new Set(project?.selectedTemplateIds ?? []),
    [localIds, project?.selectedTemplateIds],
  );
  const prompting = project?.status === "prompting";
  const generating = project?.status === "generating";

  function toggleTemplate(templateId: Id<"templates">) {
    const base =
      selectedRef.current ?? new Set(project?.selectedTemplateIds ?? []);
    const next = new Set(base);
    if (next.has(templateId)) next.delete(templateId);
    else next.add(templateId);
    selectedRef.current = next;
    setLocalIds(next);
    setSelected({ projectId, templateIds: [...next] }).catch((error) =>
      toast.error(errorMessage(error)),
    );
  }

  /** Everything after this click happens behind the scenes. */
  function generateAds() {
    generate({ projectId, autoStart: true, quality }).catch((error) =>
      toast.error(errorMessage(error, "Could not prepare the ads.")),
    );
    router.push(`/projects/${projectId}/generate`);
  }

  if (project === undefined || templates === undefined) {
    return <Skeleton className="h-64 rounded-lg" />;
  }
  if (project === null) return null;

  const hasDna = dna !== null && dna !== undefined;

  return (
    <div className="space-y-6">
      {project.promptError && !prompting && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t prepare the ads</AlertTitle>
          <AlertDescription>{project.promptError}</AlertDescription>
        </Alert>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">
              Ad formats
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {selectedIds.size} of {templates.length} selected
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Pick the formats to create for {project.brandName}. AdFlow
              writes the ads in the brand&apos;s voice automatically.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditorTarget(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            New format
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const selected = selectedIds.has(template._id);
            return (
              <button
                key={template._id}
                type="button"
                onClick={() => toggleTemplate(template._id)}
                className={cn(
                  "group relative rounded-lg border p-3 text-left transition-colors",
                  selected
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-card hover:border-ring/40",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {selected && <Check className="size-3" />}
                    </span>
                    {template.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      role="button"
                      title={
                        template.isSystem
                          ? "Duplicate to my formats"
                          : "Duplicate"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        duplicateTemplate({ templateId: template._id })
                          .then(() => toast.success("Format duplicated."))
                          .catch((error) => toast.error(errorMessage(error)));
                      }}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                    >
                      <Copy className="size-3.5" />
                    </span>
                    {!template.isSystem && (
                      <span
                        role="button"
                        title="Edit"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditorTarget(template);
                          setEditorOpen(true);
                        }}
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                      >
                        <PencilLine className="size-3.5" />
                      </span>
                    )}
                  </span>
                </div>
                <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {template.body}
                </p>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="h-4.5 px-1.5 text-[10px] text-muted-foreground"
                  >
                    {template.aspectRatio}
                  </Badge>
                  {template.needsProductImages && (
                    <Badge
                      variant="outline"
                      className="h-4.5 gap-1 px-1.5 text-[10px] text-muted-foreground"
                    >
                      <ImageIcon className="size-2.5" />
                      product
                    </Badge>
                  )}
                  {!template.isSystem && (
                    <Badge
                      variant="secondary"
                      className="h-4.5 px-1.5 text-[10px]"
                    >
                      custom
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={generateAds}
          disabled={
            prompting || generating || !hasDna || selectedIds.size === 0
          }
          className="gap-2"
        >
          {prompting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {prompting
            ? "Preparing ads…"
            : `Generate ${selectedIds.size} ad${selectedIds.size === 1 ? "" : "s"}`}
        </Button>
        <Select
          value={quality}
          onValueChange={(value) =>
            setQuality(value as "low" | "medium" | "high")
          }
          disabled={prompting || generating}
        >
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low (draft)</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        {!hasDna && (
          <p className="text-xs text-muted-foreground">
            Run{" "}
            <Link
              href={`/projects/${projectId}/brand-dna`}
              className="text-primary hover:underline"
            >
              brand research
            </Link>{" "}
            first.
          </p>
        )}
        {generating && (
          <p className="text-xs text-muted-foreground">
            A run is in progress —{" "}
            <Link
              href={`/projects/${projectId}/generate`}
              className="text-primary hover:underline"
            >
              view progress
            </Link>
            .
          </p>
        )}
      </div>

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editorTarget}
      />
    </div>
  );
}
