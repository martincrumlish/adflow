"use client";

import { useMutation, useQuery } from "convex/react";
import {
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MessageSquare,
  PencilLine,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

async function copyShareUrl(token: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(shareUrl(token));
    return true;
  } catch {
    return false;
  }
}

type ShareRow = {
  _id: Id<"shares">;
  _creationTime: number;
  token: string;
  label?: string;
  active: boolean;
  allowDownload: boolean;
  counts: { approved: number; changes: number; commented: number };
};

export function ShareDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shares = useQuery(
    api.shares.listForProject,
    open ? { projectId } : "skip",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share for review</DialogTitle>
          <DialogDescription>
            Anyone with the link can view these ads and leave feedback. No
            account needed.
          </DialogDescription>
        </DialogHeader>

        <CreateShareForm projectId={projectId} />

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Review links
          </p>
          {shares === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ) : shares.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No links yet. Create one above and send it to your client.
            </p>
          ) : (
            <ul className="space-y-2">
              {shares.map((share) => (
                <ShareItem key={share._id} share={share} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateShareForm({ projectId }: { projectId: Id<"projects"> }) {
  const createShare = useMutation(api.shares.create);
  const [label, setLabel] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const token = await createShare({
        projectId,
        label: label.trim() || undefined,
        allowDownload,
      });
      const copied = await copyShareUrl(token);
      toast.success(
        copied
          ? "Review link created and copied to your clipboard."
          : "Review link created.",
      );
      setLabel("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="share-label">Label (optional)</Label>
        <Input
          id="share-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Client round 1"
          maxLength={80}
        />
        <p className="text-[11px] text-muted-foreground">
          Reviewers see this label at the top of the page.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="share-download" className="font-normal">
          Let reviewers download images
        </Label>
        <Switch
          id="share-download"
          checked={allowDownload}
          onCheckedChange={setAllowDownload}
        />
      </div>
      <Button type="submit" className="w-full gap-2" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Link2 className="size-4" />
        )}
        Create and copy link
      </Button>
    </form>
  );
}

function ShareItem({ share }: { share: ShareRow }) {
  const updateShare = useMutation(api.shares.update);
  const removeShare = useMutation(api.shares.remove);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function update(patch: { active?: boolean; allowDownload?: boolean }) {
    updateShare({ shareId: share._id, ...patch }).catch((error) =>
      toast.error(errorMessage(error)),
    );
  }

  async function copy() {
    if (await copyShareUrl(share.token)) {
      setCopied(true);
      toast.success("Link copied.");
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Could not copy. Open the link and copy it from there.");
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await removeShare({ shareId: share._id });
      toast.success("Review link deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
      setDeleting(false);
    }
  }

  const { approved, changes, commented } = share.counts;
  const hasFeedback = approved + changes + commented > 0;

  return (
    <li
      className={cn(
        "space-y-3 rounded-lg border border-border p-3",
        !share.active && "bg-muted/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate text-sm font-medium",
              !share.active && "text-muted-foreground",
            )}
          >
            {share.label ?? "Untitled link"}
          </p>
          <p className="text-xs text-muted-foreground">
            Created {new Date(share._creationTime).toLocaleDateString()}
            {!share.active && " · Turned off"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void copy()}
            disabled={!share.active}
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
            Copy link
          </Button>
          <Button
            asChild
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground"
            title="Open review page"
          >
            <a href={`/share/${share.token}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-red-400"
            title="Delete link"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {hasFeedback ? (
          <>
            <span className="inline-flex items-center gap-1">
              <CircleCheck className="size-3.5 text-emerald-500" />
              {approved} approved
            </span>
            <span className="inline-flex items-center gap-1">
              <PencilLine className="size-3.5 text-amber-500" />
              {changes} {changes === 1 ? "needs" : "need"} changes
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" />
              {commented} comment{commented === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <span>No feedback yet</span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-xs">
          <Switch
            size="sm"
            checked={share.active}
            onCheckedChange={(active) => update({ active })}
          />
          Link active
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Switch
            size="sm"
            checked={share.allowDownload}
            onCheckedChange={(allowDownload) => update({ allowDownload })}
          />
          Allow downloads
        </label>
      </div>

      {confirming && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs">
            Delete this link? Its feedback is deleted too, and anyone holding
            it loses access.
          </p>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-3.5 animate-spin" />}
              Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Gallery feedback display ─────────────────────────────────────────────

export type ReviewFeedback = {
  verdict?: "approved" | "changes";
  comment?: string;
  reviewerName?: string;
  shareLabel?: string;
};

function verdictStyle(verdict: ReviewFeedback["verdict"]) {
  switch (verdict) {
    case "approved":
      return {
        icon: CircleCheck,
        label: "Approved",
        short: "Approved",
        className:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "changes":
      return {
        icon: PencilLine,
        label: "Changes requested",
        short: "Changes",
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    default:
      return {
        icon: MessageSquare,
        label: "Comment",
        short: "Comment",
        className: "border-border bg-muted text-muted-foreground",
      };
  }
}

function attribution(feedback: ReviewFeedback): string | null {
  const { reviewerName, shareLabel } = feedback;
  if (reviewerName && shareLabel) return `${reviewerName}, via ${shareLabel}`;
  if (reviewerName) return reviewerName;
  if (shareLabel) return `via ${shareLabel}`;
  return null;
}

/**
 * Compact client-feedback badge for gallery cards, details on hover.
 * Renders nothing when the image has no feedback.
 */
export function ReviewBadge({
  feedback,
  className,
}: {
  feedback: ReviewFeedback | undefined;
  className?: string;
}) {
  if (!feedback) return null;
  const style = verdictStyle(feedback.verdict);
  const Icon = style.icon;
  const by = attribution(feedback);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            tabIndex={0}
            aria-label={`${style.label}${feedback.comment ? `: ${feedback.comment}` : ""}`}
            className={cn(
              "h-4.5 cursor-default px-1.5 text-[10px]",
              style.className,
              className,
            )}
          >
            <Icon />
            {style.short}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="block max-w-64">
          <p className="font-medium">{style.label}</p>
          {feedback.comment && (
            <p className="mt-0.5 whitespace-pre-wrap opacity-90">
              {feedback.comment}
            </p>
          )}
          {by && <p className="mt-1 opacity-70">{by}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Full client-feedback note for the gallery lightbox. */
export function ReviewNote({ feedback }: { feedback: ReviewFeedback }) {
  const style = verdictStyle(feedback.verdict);
  const Icon = style.icon;
  const by = attribution(feedback);
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn("h-5 px-2 text-[11px]", style.className)}
        >
          <Icon />
          {style.label}
        </Badge>
        {by && <span className="text-xs text-muted-foreground">{by}</span>}
      </div>
      {feedback.comment && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {feedback.comment}
        </p>
      )}
    </div>
  );
}
