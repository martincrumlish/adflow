"use client";

import { useMutation, useQuery } from "convex/react";
import { ImageIcon, PencilLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  TemplateEditorDialog,
  type EditableTemplate,
} from "@/components/templates/template-editor-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";

/** Admin curation of the shared system template library. */
export default function AdminTemplatesPage() {
  const templates = useQuery(api.templates.list);
  const remove = useMutation(api.templates.remove);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<EditableTemplate | null>(
    null,
  );

  const systemTemplates = (templates ?? []).filter((t) => t.isSystem);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Users can duplicate these into private copies but never edit them
          directly.
        </p>
        <Button
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => {
            setEditorTarget(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="size-4" />
          New system template
        </Button>
      </div>

      {templates === undefined ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {systemTemplates.map((template) => (
            <div
              key={template._id}
              className="group rounded-lg border border-border bg-card p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-baseline gap-2 text-sm font-medium">
                  <span className="text-xs text-muted-foreground">
                    #{template.number}
                  </span>
                  {template.name}
                </p>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit"
                    className="size-7 text-muted-foreground"
                    onClick={() => {
                      setEditorTarget(template);
                      setEditorOpen(true);
                    }}
                  >
                    <PencilLine className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    className="size-7 text-muted-foreground hover:text-red-400"
                    onClick={() =>
                      remove({ templateId: template._id })
                        .then(() => toast.success("Template deleted."))
                        .catch((error) => toast.error(errorMessage(error)))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mb-3 flex items-start gap-3">
                <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {template.description ?? template.body}
                </p>
                {template.exampleImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={template.exampleImageUrl}
                    alt="Style reference"
                    title="Style reference"
                    className="size-14 shrink-0 rounded-md border border-border object-cover"
                  />
                )}
              </div>
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
                {template.category && (
                  <Badge
                    variant="outline"
                    className="h-4.5 px-1.5 text-[10px] text-muted-foreground"
                  >
                    {template.category}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editorTarget}
        mode="system"
      />
    </div>
  );
}
