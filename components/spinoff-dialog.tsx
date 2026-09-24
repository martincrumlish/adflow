"use client";

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errors";

type Ratio = "1:1" | "4:5" | "9:16";
type Quality = "low" | "medium" | "high";

const PLACEMENTS: { ratio: Ratio; name: string; use: string }[] = [
  { ratio: "1:1", name: "Square", use: "for feed" },
  { ratio: "4:5", name: "Portrait", use: "for feed" },
  { ratio: "9:16", name: "Story", use: "for Stories and Reels" },
];

export type SpinoffSource = {
  _id: Id<"images">;
  templateName: string;
  aspectRatio: string;
  url: string | null;
};

/** Re-render a finished ad in the placements it isn't in yet. */
export function SpinoffDialog({
  image,
  onClose,
}: {
  image: SpinoffSource | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {image && (
          // Keyed so the choices reset for each image.
          <SpinoffForm key={image._id} image={image} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SpinoffForm({
  image,
  onDone,
}: {
  image: SpinoffSource;
  onDone: () => void;
}) {
  const create = useMutation(api.spinoffs.create);
  const options = PLACEMENTS.filter((p) => p.ratio !== image.aspectRatio);
  const [selected, setSelected] = useState<Set<Ratio>>(
    () => new Set(options.map((p) => p.ratio)),
  );
  const [quality, setQuality] = useState<Quality>("high");
  const [pending, setPending] = useState(false);

  function toggle(ratio: Ratio) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(ratio)) next.delete(ratio);
      else next.add(ratio);
      return next;
    });
  }

  async function onCreate() {
    setPending(true);
    try {
      const count = await create({
        imageId: image._id,
        aspectRatios: options
          .map((p) => p.ratio)
          .filter((ratio) => selected.has(ratio)),
        quality,
      });
      toast.success(
        `Making ${count} new size${count === 1 ? "" : "s"} of “${image.templateName}”. They’ll appear in the gallery shortly.`,
      );
      onDone();
    } catch (error) {
      toast.error(errorMessage(error, "Could not start the new sizes."));
    } finally {
      setPending(false);
    }
  }

  const count = selected.size;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Spin off to other sizes</DialogTitle>
        <DialogDescription>
          Recreates this ad with the same copy and look, recomposed for each
          placement you pick. The original stays as it is.
        </DialogDescription>
      </DialogHeader>
      <div className="flex gap-4">
        <div className="flex w-24 shrink-0 items-start justify-center">
          {image.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={image.templateName}
              className="max-h-32 w-auto rounded-md border border-border"
            />
          ) : (
            <div className="aspect-square w-full rounded-md bg-muted" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-xs text-muted-foreground">
            {image.templateName} · currently {image.aspectRatio}
          </p>
          {options.map((placement) => {
            const checked = selected.has(placement.ratio);
            return (
              <label
                key={placement.ratio}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                  checked
                    ? "border-border bg-card"
                    : "border-transparent bg-muted/40 text-muted-foreground",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(placement.ratio)}
                  disabled={pending}
                />
                <span className="font-medium">
                  {placement.name} {placement.ratio}
                </span>
                <span className="text-xs text-muted-foreground">
                  {placement.use}
                </span>
              </label>
            );
          })}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs font-medium text-muted-foreground">Quality</p>
            <Select
              value={quality}
              onValueChange={(value) => setQuality(value as Quality)}
              disabled={pending}
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
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={() => void onCreate()} disabled={pending || count === 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {count === 0
            ? "Pick a size"
            : `Create ${count} size${count === 1 ? "" : "s"}`}
        </Button>
      </DialogFooter>
    </>
  );
}
