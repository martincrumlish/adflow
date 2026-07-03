"use client";

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
};

/**
 * Create (template === null) or edit (template set) a template.
 * Controlled from outside via open/onOpenChange.
 */
export function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EditableTemplate | null;
}) {
  const createTemplate = useMutation(api.templates.create);
  const updateTemplate = useMutation(api.templates.update);
  const [pending, setPending] = useState(false);

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [aspect, setAspect] = useState<"1:1" | "4:5" | "9:16">("1:1");
  const [needsProduct, setNeedsProduct] = useState(false);
  const [category, setCategory] = useState("");

  useEffect(() => {
    if (open) {
      setName(template?.name ?? "");
      setBody(template?.body ?? "");
      setAspect(template?.aspectRatio ?? "1:1");
      setNeedsProduct(template?.needsProductImages ?? false);
      setCategory(template?.category ?? "");
    }
  }, [open, template]);

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
        });
        toast.success("Template saved.");
      } else {
        await createTemplate({
          name,
          body,
          aspectRatio: aspect,
          needsProductImages: needsProduct,
          category: category || undefined,
        });
        toast.success("Template created.");
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
            {template ? "Edit template" : "New template"}
          </DialogTitle>
          <DialogDescription>
            Use [BRACKETED PLACEHOLDERS] for details the AI fills per brand,
            and keep literal ad copy inside double quotes.
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
            {template ? "Save template" : "Create template"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
