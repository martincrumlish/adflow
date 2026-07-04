"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  PencilLine,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BrandDnaDocument, HexText } from "@/components/brand-dna-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";

export default function BrandDnaPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });
  const dna = useQuery(api.brandDna.get, { projectId });
  const runResearch = useAction(api.research.run);
  const updateDna = useMutation(api.brandDna.update);

  const [editingDoc, setEditingDoc] = useState(false);
  const [docDraft, setDocDraft] = useState("");
  const [editingModifier, setEditingModifier] = useState(false);
  const [modifierDraft, setModifierDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const researching = project?.status === "researching";

  function startResearch() {
    // Fire and forget: progress is driven reactively by project.status.
    runResearch({ projectId }).catch((error) =>
      toast.error(errorMessage(error, "Brand research failed.")),
    );
  }

  async function saveDoc() {
    setSaving(true);
    try {
      await updateDna({ projectId, document: docDraft });
      setEditingDoc(false);
      toast.success("Brand DNA saved.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveModifier() {
    setSaving(true);
    try {
      await updateDna({ projectId, promptModifier: modifierDraft });
      setEditingModifier(false);
      toast.success("Prompt modifier saved.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (project === undefined || dna === undefined) {
    return <Skeleton className="h-64 rounded-lg" />;
  }
  if (project === null) return null;

  return (
    <div className="space-y-4">
      {project.researchError && !researching && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Research failed</AlertTitle>
          <AlertDescription>{project.researchError}</AlertDescription>
        </Alert>
      )}

      {researching ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              Researching {project.brandName}…
            </CardTitle>
            <CardDescription>
              AdFlow is searching the web and analyzing {project.brandUrl}.
              This usually takes a minute or two — feel free to navigate away.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ) : dna === null ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Sparkles className="mb-3 size-8 text-muted-foreground/50" />
          <p className="mb-1 text-sm font-medium">No Brand DNA yet</p>
          <p className="mb-4 max-w-sm text-sm text-muted-foreground">
            Run brand research to reverse-engineer {project.brandName}&apos;s
            visual and verbal identity into a document that powers every
            prompt.
          </p>
          <Button onClick={startResearch} className="gap-2">
            <Sparkles className="size-4" />
            Run Brand Research
          </Button>
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Brand DNA</CardTitle>
                  <CardDescription>
                    Everything AdFlow learned about {project.brandName}. Edit
                    anything that&apos;s off.
                  </CardDescription>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!editingDoc && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground"
                        onClick={startResearch}
                      >
                        <RefreshCw className="size-3.5" />
                        Re-run research
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setDocDraft(dna.document);
                          setEditingDoc(true);
                        }}
                      >
                        <PencilLine className="size-3.5" />
                        Edit
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {editingDoc ? (
                <div className="space-y-3">
                  <Textarea
                    value={docDraft}
                    onChange={(event) => setDocDraft(event.target.value)}
                    className="min-h-96 font-mono text-xs leading-relaxed"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveDoc} disabled={saving}>
                      {saving && <Loader2 className="size-4 animate-spin" />}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingDoc(false)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <BrandDnaDocument document={dna.document} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Visual style</CardTitle>
                  <CardDescription>
                    The distilled look and feel applied to every ad in this
                    project.
                  </CardDescription>
                </div>
                {!editingModifier && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => {
                      setModifierDraft(dna.promptModifier);
                      setEditingModifier(true);
                    }}
                  >
                    <PencilLine className="size-3.5" />
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editingModifier ? (
                <div className="space-y-3">
                  <Textarea
                    value={modifierDraft}
                    onChange={(event) => setModifierDraft(event.target.value)}
                    className="min-h-32 text-sm leading-relaxed"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveModifier} disabled={saving}>
                      {saving && <Loader2 className="size-4 animate-spin" />}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingModifier(false)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : dna.promptModifier ? (
                <p className="text-sm leading-relaxed text-foreground/90">
                  <HexText text={dna.promptModifier} />
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No visual style was extracted — edit to add one, or re-run
                  research.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button asChild size="sm" className="gap-2">
              <Link href={`/projects/${projectId}/prompts`}>
                Choose ad formats
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
