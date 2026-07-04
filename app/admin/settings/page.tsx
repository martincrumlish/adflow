"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errors";

const DEFAULT_TEXT_MODEL = "anthropic/claude-sonnet-5";
const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2";

type ModelOption = { id: string; name: string; hasEdit?: boolean };

function ModelPicker({
  value,
  onChange,
  models,
  loading,
  idLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  models: ModelOption[];
  loading: boolean;
  idLabel: string;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const filtered = (
    query
      ? models.filter((m) =>
          (m.id + " " + m.name).toLowerCase().includes(query),
        )
      : models
  ).slice(0, 60);

  return (
    <div className="space-y-2">
      <Label>{idLabel}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="font-mono text-xs"
        spellCheck={false}
      />
      <Input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Search the catalog…"
        className="h-8 text-xs"
      />
      <div className="max-h-52 overflow-y-auto rounded-md border border-border">
        {loading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            No models match.
          </p>
        ) : (
          filtered.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => onChange(model.id)}
              className={cn(
                "flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-xs transition-colors last:border-b-0 hover:bg-secondary/60",
                value === model.id && "bg-secondary",
              )}
            >
              {value === model.id && (
                <Check className="size-3 shrink-0 text-primary" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {model.name}
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {model.id}
                </span>
              </span>
              {model.hasEdit !== undefined &&
                (model.hasEdit ? (
                  <Badge
                    variant="secondary"
                    className="h-4.5 shrink-0 px-1.5 text-[10px]"
                  >
                    references ✓
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-4.5 shrink-0 px-1.5 text-[10px] text-muted-foreground"
                  >
                    no references
                  </Badge>
                ))}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const current = useQuery(api.settings.adminGet);
  const save = useMutation(api.settings.adminUpdate);
  const listTextModels = useAction(api.settings.listTextModels);
  const listImageModels = useAction(api.settings.listImageModels);

  const [textModel, setTextModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [textModels, setTextModels] = useState<ModelOption[]>([]);
  const [imageModels, setImageModels] = useState<ModelOption[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (current && !initialized) {
      setTextModel(current.textModel);
      setImageModel(current.imageModel);
      setInitialized(true);
    }
  }, [current, initialized]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTextModels({}), listImageModels({})])
      .then(([text, image]) => {
        if (cancelled) return;
        setTextModels(text);
        setImageModels(image);
      })
      .catch((error) =>
        toast.error(errorMessage(error, "Could not load model catalogs.")),
      )
      .finally(() => !cancelled && setLoadingCatalogs(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave() {
    setSaving(true);
    try {
      await save({ textModel, imageModel });
      toast.success("Settings saved — new runs use these models.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    current !== null &&
    current !== undefined &&
    (textModel !== current.textModel || imageModel !== current.imageModel);

  if (current === undefined) return <Skeleton className="h-64 rounded-lg" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Text model</CardTitle>
          <CardDescription>
            Runs brand research and ad copywriting via OpenRouter. Only
            tool-capable models are listed (research uses live web search).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <ModelPicker
            value={textModel}
            onChange={setTextModel}
            models={textModels}
            loading={loadingCatalogs}
            idLabel="OpenRouter model slug"
          />
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setTextModel(DEFAULT_TEXT_MODEL)}
            disabled={textModel === DEFAULT_TEXT_MODEL}
          >
            <RotateCcw className="size-3" />
            Reset to default ({DEFAULT_TEXT_MODEL})
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Image model</CardTitle>
          <CardDescription>
            The FAL endpoint that renders the ads. Models marked “no
            references” have no edit variant, so ads that use product photos
            or template style examples will fail on them — prefer models with
            reference support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <ModelPicker
            value={imageModel}
            onChange={setImageModel}
            models={imageModels}
            loading={loadingCatalogs}
            idLabel="FAL endpoint id"
          />
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setImageModel(DEFAULT_IMAGE_MODEL)}
            disabled={imageModel === DEFAULT_IMAGE_MODEL}
          >
            <RotateCcw className="size-3" />
            Reset to default ({DEFAULT_IMAGE_MODEL})
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={saving || !dirty}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save settings
        </Button>
        {dirty && (
          <p className="text-xs text-muted-foreground">
            Applies to new runs; in-flight generations keep their models.
          </p>
        )}
      </div>
    </div>
  );
}
