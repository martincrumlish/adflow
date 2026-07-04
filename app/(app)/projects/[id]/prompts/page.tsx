"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowRight,
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errors";

type Aspect = "1:1" | "4:5" | "9:16";

function PromptCard({
  prompt,
}: {
  prompt: {
    _id: Id<"prompts">;
    templateNumber: number;
    templateName: string;
    prompt: string;
    aspectRatio: Aspect;
    needsProductImages: boolean;
    notes?: string;
  };
}) {
  const update = useMutation(api.prompts.update);
  const [text, setText] = useState(prompt.prompt);
  const [notes, setNotes] = useState(prompt.notes ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = text !== prompt.prompt || notes !== (prompt.notes ?? "");

  async function save() {
    setSaving(true);
    try {
      await update({ promptId: prompt._id, prompt: text, notes });
      toast.success(`Saved “${prompt.templateName}”.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              #{prompt.templateNumber}
            </span>
            {prompt.templateName}
          </CardTitle>
          <div className="flex items-center gap-4">
            <Select
              value={prompt.aspectRatio}
              onValueChange={(value) =>
                update({
                  promptId: prompt._id,
                  aspectRatio: value as Aspect,
                }).catch((error) => toast.error(errorMessage(error)))
              }
            >
              <SelectTrigger size="sm" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1:1">1:1</SelectItem>
                <SelectItem value="4:5">4:5</SelectItem>
                <SelectItem value="9:16">9:16</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="size-3.5" />
              Product
              <Switch
                checked={prompt.needsProductImages}
                onCheckedChange={(checked) =>
                  update({
                    promptId: prompt._id,
                    needsProductImages: checked,
                  }).catch((error) => toast.error(errorMessage(error)))
                }
              />
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-28 text-xs leading-relaxed"
        />
        <Input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notes (optional)"
          className="h-8 text-xs"
        />
        {dirty && (
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function PromptsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });
  const dna = useQuery(api.brandDna.get, { projectId });
  const templates = useQuery(api.templates.list);
  const prompts = useQuery(api.prompts.listForProject, { projectId });
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

  /** One-click flow: copy is written behind the scenes, then images. */
  function generateAds() {
    generate({ projectId, autoStart: true, quality }).catch((error) =>
      toast.error(errorMessage(error, "Could not prepare the ads.")),
    );
    router.push(`/projects/${projectId}/generate`);
  }

  /** Power-user flow: write the copy only, review it on this page. */
  function writeCopyOnly() {
    generate({ projectId }).catch((error) =>
      toast.error(errorMessage(error, "Could not write the ad copy.")),
    );
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
          <AlertTitle>Prompt generation failed</AlertTitle>
          <AlertDescription>{project.promptError}</AlertDescription>
        </Alert>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">
              Templates
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {selectedIds.size} of {templates.length} selected
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Pick the ad formats to fill with {project.brandName}&apos;s brand
              DNA.
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
            New template
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
                          ? "Duplicate to my templates"
                          : "Duplicate"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        duplicateTemplate({ templateId: template._id })
                          .then(() => toast.success("Template duplicated."))
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
        <Button
          variant="ghost"
          size="sm"
          onClick={writeCopyOnly}
          disabled={
            prompting || generating || !hasDna || selectedIds.size === 0
          }
          className="text-muted-foreground"
        >
          {prompts && prompts.length > 0
            ? "Rewrite copy for review"
            : "Write copy for review first"}
        </Button>
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
      </div>

      {prompting ? (
        <div className="space-y-3">
          {Array.from({ length: Math.max(selectedIds.size, 3) }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : prompts && prompts.length > 0 ? (
        <>
          <section className="space-y-3">
            {prompts.map((prompt) => (
              <PromptCard key={prompt._id} prompt={prompt} />
            ))}
          </section>
          <div className="flex justify-end">
            <Button asChild size="sm" className="gap-2">
              <Link href={`/projects/${projectId}/generate`}>
                Continue to Generate
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </>
      ) : null}

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editorTarget}
      />
    </div>
  );
}
