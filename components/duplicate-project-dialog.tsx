"use client";

import { useAction, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";

export type DuplicateSource = {
  _id: Id<"projects">;
  name: string;
  productName: string;
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "a", "a and b", "a, b and c" */
function listSentence(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function CarryOver({ projectId }: { projectId: Id<"projects"> }) {
  const summary = useQuery(api.projectDuplicate.summary, { projectId });

  if (summary === undefined) {
    return <Skeleton className="h-14 rounded-md" />;
  }
  if (summary === null) return null;

  const items: string[] = [];
  if (summary.hasBrandDna) items.push("Brand DNA");
  if (summary.productImageCount > 0) {
    items.push(
      plural(summary.productImageCount, "product photo", "product photos"),
    );
  }
  if (summary.hasLogo) items.push("logo");
  if (summary.formatCount > 0) {
    items.push(
      plural(summary.formatCount, "selected format", "selected formats"),
    );
  }

  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Carries over: </span>
        {items.length > 0
          ? `brand details, ${listSentence(items)}.`
          : "brand name and URL."}
      </p>
      <p>
        {summary.hasBrandDna
          ? "Prompts and generated ads stay with the original."
          : "This project has no Brand DNA yet, so the copy starts at setup."}
      </p>
    </div>
  );
}

export function DuplicateProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: DuplicateSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const duplicate = useAction(api.projectDuplicate.duplicate);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const fallbackName = `${project.name} copy`;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = (formData.get("name") as string).trim() || fallbackName;
    setPending(true);
    try {
      const result = await duplicate({
        projectId: project._id,
        name,
        productName: formData.get("productName") as string,
      });
      if (result.skippedFiles > 0) {
        toast.warning(
          `Created “${name}”, but ${plural(result.skippedFiles, "file", "files")} couldn’t be copied. Re-upload on the setup page.`,
        );
      } else {
        toast.success(`Created “${name}”.`);
      }
      onOpenChange(false);
      router.push(
        `/projects/${result.projectId}/${result.hasBrandDna ? "brand-dna" : "setup"}`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Keep the dialog up while files copy so the result isn't lost.
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate project</DialogTitle>
          <DialogDescription>
            Start a new campaign from the same Brand DNA, no research needed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dp-name">Project name</Label>
            <Input
              id="dp-name"
              name="name"
              defaultValue={fallbackName}
              placeholder={fallbackName}
              onFocus={(event) => event.currentTarget.select()}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dp-product">Product name</Label>
            <Input
              id="dp-product"
              name="productName"
              defaultValue={project.productName}
              placeholder={project.productName}
              disabled={pending}
            />
          </div>
          <CarryOver projectId={project._id} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
