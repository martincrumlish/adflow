"use client";

import { useMutation } from "convex/react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";

export type EditableTemplate = {
  _id: Id<"templates">;
  name: string;
  body: string;
  aspectRatio: "1:1" | "4:5" | "9:16";
  needsProductImages: boolean;
  category?: string;
  exampleImageUrl?: string | null;
};

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Create (template === null) or edit (template set) a template.
 * mode "user" manages the caller's private templates; mode "system"
 * (admin area only) manages the shared library.
 */
export function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  mode = "user",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EditableTemplate | null;
  mode?: "user" | "system";
}) {
  const createTemplate = useMutation(api.templates.create);
  const updateTemplate = useMutation(api.templates.update);
  const generateUploadUrl = useMutation(api.templates.generateUploadUrl);
  const [pending, setPending] = useState(false);

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [aspect, setAspect] = useState<"1:1" | "4:5" | "9:16">("1:1");
  const [needsProduct, setNeedsProduct] = useState(false);
  const [category, setCategory] = useState("");

  // Style reference image: a freshly uploaded storage id, an explicit
  // removal, or untouched (undefined on submit).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [newExampleId, setNewExampleId] = useState<Id<"_storage"> | null>(
    null,
  );
  const [newExamplePreview, setNewExamplePreview] = useState<string | null>(
    null,
  );
  const [removeExample, setRemoveExample] = useState(false);

  const examplePreview = removeExample
    ? null
    : (newExamplePreview ?? template?.exampleImageUrl ?? null);

  useEffect(() => {
    if (open) {
      setName(template?.name ?? "");
      setBody(template?.body ?? "");
      setAspect(template?.aspectRatio ?? "1:1");
      setNeedsProduct(template?.needsProductImages ?? false);
      setCategory(template?.category ?? "");
      setNewExampleId(null);
      setNewExamplePreview(null);
      setRemoveExample(false);
    }
  }, [open, template]);

  async function onExampleSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPG, or WebP images.");
      return;
    }
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };
      setNewExampleId(storageId);
      setNewExamplePreview(URL.createObjectURL(file));
      setRemoveExample(false);
    } catch (error) {
      toast.error(errorMessage(error, "Upload failed."));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      if (template) {
        await updateTemplate({
          templateId: template._id,
          name,
          body,
          aspectRatio: aspect,
          needsProductImages: needsProduct,
          category,
          exampleImageId:
            newExampleId ?? (removeExample ? null : undefined),
        });
        toast.success("Template saved.");
      } else {
        await createTemplate({
          name,
          body,
          aspectRatio: aspect,
          needsProductImages: needsProduct,
          category: category || undefined,
          exampleImageId: newExampleId ?? undefined,
          system: mode === "system" ? true : undefined,
        });
        toast.success(
          mode === "system" ? "System template added." : "Template created.",
        );
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {template
              ? "Edit template"
              : mode === "system"
                ? "New system template"
                : "New template"}
          </DialogTitle>
          <DialogDescription>
            Use [BRACKETED PLACEHOLDERS] for details the AI fills per brand,
            and keep literal ad copy inside double quotes.
            {mode === "system" &&
              " System templates are visible to every user."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="headline"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-category">Category (optional)</Label>
              <Input
                id="tpl-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="product"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-body">Prompt body</Label>
            <Textarea
              id="tpl-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-36 text-xs leading-relaxed"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Style reference (optional)</Label>
            <p className="text-xs text-muted-foreground">
              An example render of this layout, shown to the image model as a
              composition guide — brand and copy still come from the prompt.
            </p>
            <div className="flex items-center gap-3">
              {examplePreview ? (
                <div className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={examplePreview}
                    alt="Style reference"
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    title="Remove style reference"
                    onClick={() => {
                      setNewExampleId(null);
                      setNewExamplePreview(null);
                      setRemoveExample(true);
                    }}
                    className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImagePlus className="size-4" />
                  )}
                  <span className="text-[10px]">
                    {uploading ? "Uploading…" : "Add image"}
                  </span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                hidden
                onChange={(event) =>
                  void onExampleSelected(event.target.files)
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="space-y-2">
              <Label>Aspect ratio</Label>
              <Select
                value={aspect}
                onValueChange={(value) =>
                  setAspect(value as "1:1" | "4:5" | "9:16")
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">1:1</SelectItem>
                  <SelectItem value="4:5">4:5</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-product">Needs product images</Label>
              <div className="pt-1">
                <Switch
                  id="tpl-product"
                  checked={needsProduct}
                  onCheckedChange={setNeedsProduct}
                />
              </div>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {template
              ? "Save template"
              : mode === "system"
                ? "Add to system library"
                : "Create template"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
