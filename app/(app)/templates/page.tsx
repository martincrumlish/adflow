"use client";

import { useMutation, useQuery } from "convex/react";
import { Copy, ImageIcon, PencilLine, Plus, Trash2 } from "lucide-react";
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

export default function TemplatesPage() {
  const templates = useQuery(api.templates.list);
  const viewer = useQuery(api.users.viewer);
  const duplicate = useMutation(api.templates.duplicate);
  const remove = useMutation(api.templates.remove);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<EditableTemplate | null>(
    null,
  );

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            The ad-format library. System templates are shared; your custom
            templates are private.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => {
            setEditorTarget(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="size-4" />
          New template
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
          {templates.map((template) => {
            const canEdit =
              !template.isSystem || viewer?.isAdmin === true;
            const canDelete = canEdit;
            return (
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
                      title="Duplicate to my templates"
                      className="size-7 text-muted-foreground"
                      onClick={() =>
                        duplicate({ templateId: template._id })
                          .then(() => toast.success("Template duplicated."))
                          .catch((error) => toast.error(errorMessage(error)))
                      }
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    {canEdit && (
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
                    )}
                    {canDelete && (
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
                    )}
                  </div>
                </div>
                <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
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
                  {template.category && (
                    <Badge
                      variant="outline"
                      className="h-4.5 px-1.5 text-[10px] text-muted-foreground"
                    >
                      {template.category}
                    </Badge>
                  )}
                  <Badge
                    variant="secondary"
                    className="ml-auto h-4.5 px-1.5 text-[10px]"
                  >
                    {template.isSystem ? "system" : "custom"}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editorTarget}
      />
    </div>
  );
}
