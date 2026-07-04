"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Play,
  RotateCcw,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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

type Quality = "low" | "medium" | "high";

const JOB_ICON = {
  queued: (
    <CircleDashed className="size-4 text-muted-foreground/60" />
  ),
  running: <Loader2 className="size-4 animate-spin text-primary" />,
  done: <CheckCircle2 className="size-4 text-emerald-400" />,
  error: <XCircle className="size-4 text-red-400" />,
} as const;

export default function GeneratePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });
  const prompts = useQuery(api.prompts.listForProject, { projectId });
  const jobs = useQuery(api.generation.jobsForProject, { projectId });
  const start = useMutation(api.generation.start);
  const regenerateOne = useMutation(api.generation.regenerateOne);

  const [quality, setQuality] = useState<Quality>("high");
  const [subset, setSubset] = useState<Set<Id<"prompts">> | null>(null);
  // Ref mirror so rapid toggles never compute from stale state.
  const subsetRef = useRef<Set<Id<"prompts">> | null>(null);
  const [starting, setStarting] = useState(false);

  const generating = project?.status === "generating";

  // Which prompts run: null means "all".
  const selectedPromptIds = useMemo(() => {
    if (!prompts) return [];
    if (subset === null) return prompts.map((p) => p._id);
    return prompts.filter((p) => subset.has(p._id)).map((p) => p._id);
  }, [prompts, subset]);

  const summary = useMemo(() => {
    const list = jobs ?? [];
    return {
      total: list.length,
      done: list.filter((j) => j.status === "done").length,
      failed: list.filter((j) => j.status === "error").length,
      running: list.filter((j) => j.status === "running").length,
    };
  }, [jobs]);

  // Completion toast when a run finishes while this view is open.
  const wasGenerating = useRef(false);
  useEffect(() => {
    if (generating) wasGenerating.current = true;
    else if (wasGenerating.current && project?.status === "done") {
      wasGenerating.current = false;
      if (summary.failed > 0) {
        toast.warning(
          `Generation finished: ${summary.done} done, ${summary.failed} failed.`,
        );
      } else if (summary.done > 0) {
        toast.success(`Generation complete — ${summary.done} images ready.`);
      }
    }
  }, [generating, project?.status, summary.done, summary.failed]);

  async function onStart() {
    setStarting(true);
    try {
      await start({
        projectId,
        quality,
        promptIds:
          subset === null ? undefined : (selectedPromptIds as Id<"prompts">[]),
      });
    } catch (error) {
      toast.error(errorMessage(error, "Could not start generation."));
    } finally {
      setStarting(false);
    }
  }

  function togglePrompt(promptId: Id<"prompts">) {
    if (!prompts) return;
    const base = subsetRef.current ?? new Set(prompts.map((p) => p._id));
    const current = new Set(base);
    if (current.has(promptId)) current.delete(promptId);
    else current.add(promptId);
    subsetRef.current = current;
    setSubset(current);
  }

  if (project === undefined || prompts === undefined) {
    return <Skeleton className="h-64 rounded-lg" />;
  }
  if (project === null) return null;

  // One-click flow: ad copy is being written before the run starts.
  if (project.status === "prompting") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-20 text-center">
        <Loader2 className="mb-3 size-8 animate-spin text-primary" />
        <p className="mb-1 text-sm font-medium">Preparing your ads…</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Writing on-brand copy for each selected format. Generation starts
          automatically — images will appear here and in the gallery.
        </p>
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
        <Play className="mb-3 size-8 text-muted-foreground/50" />
        <p className="mb-1 text-sm font-medium">Nothing to generate yet</p>
        <p className="mb-4 max-w-sm text-sm text-muted-foreground">
          Pick your ad formats and hit Generate — the copy is written for you.
        </p>
        <Button asChild size="sm">
          <Link href={`/projects/${projectId}/prompts`}>Choose formats</Link>
        </Button>
      </div>
    );
  }

  const hasJobs = (jobs?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Run image generation</CardTitle>
          <CardDescription>
            Images render a few at a time in the background — you can close
            this tab and come back to a full gallery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Quality
              </p>
              <Select
                value={quality}
                onValueChange={(value) => setQuality(value as Quality)}
                disabled={generating}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (draft)</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={onStart}
              disabled={
                generating || starting || selectedPromptIds.length === 0
              }
              className="gap-2"
            >
              {generating || starting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {generating
                ? "Generating…"
                : `Generate ${selectedPromptIds.length} image${selectedPromptIds.length === 1 ? "" : "s"}`}
            </Button>
          </div>

          {!generating && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Prompts to run
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {prompts.map((prompt) => {
                  const checked =
                    subset === null ? true : subset.has(prompt._id);
                  return (
                    <label
                      key={prompt._id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                        checked
                          ? "border-border bg-card"
                          : "border-transparent bg-muted/40 text-muted-foreground",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePrompt(prompt._id)}
                      />
                      <span className="truncate">
                        #{prompt.templateNumber} {prompt.templateName}
                      </span>
                      <Badge
                        variant="outline"
                        className="ml-auto h-4 px-1 text-[10px] text-muted-foreground"
                      >
                        {prompt.aspectRatio}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {hasJobs && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>
                {generating ? "Generating…" : "Last run"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {summary.done}/{summary.total} done
                {summary.failed > 0 && (
                  <span className="text-red-400">
                    {" "}
                    · {summary.failed} failed
                  </span>
                )}
              </p>
            </div>
            <Progress
              value={
                summary.total === 0
                  ? 0
                  : ((summary.done + summary.failed) / summary.total) * 100
              }
              className="h-1.5"
            />
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {(jobs ?? []).map((job) => (
                <li key={job._id} className="py-2">
                  <div className="flex items-center gap-3">
                    {JOB_ICON[job.status]}
                    <span className="text-[13px]">{job.templateName}</span>
                    <Badge
                      variant="outline"
                      className="h-4 px-1 text-[10px] text-muted-foreground"
                    >
                      {job.aspectRatio}
                    </Badge>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {job.quality}
                      </span>
                      {job.status === "error" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                          onClick={() =>
                            regenerateOne({
                              promptId: job.promptId,
                              quality: job.quality,
                            }).catch((error) =>
                              toast.error(errorMessage(error)),
                            )
                          }
                        >
                          <RotateCcw className="size-3" />
                          Retry
                        </Button>
                      )}
                    </span>
                  </div>
                  {job.status === "error" && job.error && (
                    <p className="ml-7 mt-1 text-xs text-red-400/90">
                      {job.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(summary.done > 0 || project.status === "done") && (
        <div className="flex justify-end">
          <Button asChild size="sm" className="gap-2">
            <Link href={`/projects/${projectId}/gallery`}>
              View Gallery
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
