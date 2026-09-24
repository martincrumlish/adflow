"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  Link2Off,
  Loader2,
  PencilLine,
  UserRound,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Review = NonNullable<FunctionReturnType<typeof api.shares.view>>;
type ReviewImage = Review["images"][number];
type Feedback = ReviewImage["feedback"];
type Verdict = "approved" | "changes";
type FeedbackPatch = { verdict?: Verdict | null; comment?: string };
type Submit = (imageId: Id<"images">, patch: FeedbackPatch) => Promise<boolean>;

// ─── Reviewer name, remembered per browser ────────────────────────────────

const NAME_KEY = "adflow:reviewer-name";
let reviewerName: string | null = null;
const nameListeners = new Set<() => void>();

function readName(): string {
  if (reviewerName === null) {
    try {
      reviewerName = window.localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      reviewerName = "";
    }
  }
  return reviewerName;
}

function writeName(value: string) {
  reviewerName = value;
  try {
    if (value.trim()) window.localStorage.setItem(NAME_KEY, value);
    else window.localStorage.removeItem(NAME_KEY);
  } catch {
    // Private mode or storage disabled: keep it for this visit only.
  }
  nameListeners.forEach((listener) => listener());
}

function subscribeName(listener: () => void) {
  nameListeners.add(listener);
  return () => {
    nameListeners.delete(listener);
  };
}

function useReviewerName(): [string, (value: string) => void] {
  const name = useSyncExternalStore(subscribeName, readName, () => "");
  return [name, writeName];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ad"
  );
}

async function downloadImage(image: ReviewImage, brandName: string) {
  try {
    const response = await fetch(image.url);
    if (!response.ok) throw new Error(String(response.status));
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${slugify(brandName)}-${slugify(image.templateName)}-${image.aspectRatio.replace(":", "x")}.png`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    toast.error("Download failed. Try again in a moment.");
  }
}

/** Mirrors submitFeedback's merge rules for an instant optimistic UI. */
function mergeFeedback(
  previous: Feedback,
  args: FeedbackPatch & { reviewerName?: string },
): Feedback {
  const verdict =
    args.verdict === undefined ? previous?.verdict : (args.verdict ?? undefined);
  const comment =
    args.comment === undefined
      ? previous?.comment
      : args.comment.trim().slice(0, 1000) || undefined;
  const reviewerName =
    args.reviewerName === undefined
      ? previous?.reviewerName
      : args.reviewerName.trim().slice(0, 80) || undefined;
  if (verdict === undefined && comment === undefined) return null;
  return { verdict, comment, reviewerName };
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ShareReviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const review = useQuery(api.shares.view, { token });

  if (review === undefined) return <ReviewSkeleton />;
  if (review === null) return <LinkUnavailable />;
  return <ReviewBoard token={token} review={review} />;
}

function PageFooter() {
  return (
    <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
      Reviewed with AdFlow
    </footer>
  );
}

function ReviewSkeleton() {
  const heights = ["h-72", "h-56", "h-96", "h-64", "h-80", "h-60", "h-72", "h-56"];
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo />
          <div className="space-y-1.5">
            <Skeleton className="ml-auto h-4 w-44" />
            <Skeleton className="ml-auto h-3 w-32" />
          </div>
        </div>
      </header>
      <div className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
          {heights.map((height, index) => (
            <Skeleton
              key={index}
              className={cn("mb-3 break-inside-avoid rounded-lg", height)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function LinkUnavailable() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="max-w-sm space-y-3 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
            <Link2Off className="size-4 text-muted-foreground" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            This review link is no longer available.
          </h1>
          <p className="text-sm text-muted-foreground">
            Ask whoever sent it for a new one.
          </p>
        </div>
      </main>
      <PageFooter />
    </div>
  );
}

function ReviewBoard({ token, review }: { token: string; review: Review }) {
  const [name, setName] = useReviewerName();
  const [lightboxId, setLightboxId] = useState<Id<"images"> | null>(null);

  const submitFeedback = useMutation(
    api.shares.submitFeedback,
  ).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.shares.view, { token: args.token });
    if (!current) return;
    store.setQuery(
      api.shares.view,
      { token: args.token },
      {
        ...current,
        images: current.images.map((image) =>
          image._id === args.imageId
            ? { ...image, feedback: mergeFeedback(image.feedback, args) }
            : image,
        ),
      },
    );
  });

  const submit: Submit = async (imageId, patch) => {
    try {
      await submitFeedback({ token, imageId, ...patch, reviewerName: name });
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Could not save your feedback."));
      return false;
    }
  };

  const images = review.images;
  const total = images.length;
  const approved = images.filter(
    (image) => image.feedback?.verdict === "approved",
  ).length;
  const changes = images.filter(
    (image) => image.feedback?.verdict === "changes",
  ).length;

  const lightboxIndex = images.findIndex((image) => image._id === lightboxId);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
          <Logo className="shrink-0" />
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-sm font-medium">
              Review · {review.projectName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {review.brandName} · {review.productName}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:border-l sm:border-border sm:pl-4">
            <div className="relative flex-1 sm:w-48 sm:flex-none">
              <UserRound className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Your name"
                placeholder="Your name"
                autoComplete="name"
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="pl-8"
              />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <SummaryText total={total} approved={approved} changes={changes} />
          {review.label && (
            <Badge variant="secondary" className="text-[11px]">
              {review.label}
            </Badge>
          )}
          {total > 0 && (
            <ProgressBar
              total={total}
              approved={approved}
              changes={changes}
              className="w-full sm:ml-auto sm:w-56"
            />
          )}
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
            <p className="mb-1 text-sm font-medium">Nothing to review yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              The ads for this review aren&apos;t ready. Check back soon.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
              Approve the ads that are ready to run, or request changes and
              leave a note. Everything saves as you go.
              {!name.trim() &&
                " Add your name at the top so the team knows who said what."}
            </p>
            <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
              {images.map((image) => (
                <ReviewCard
                  key={image._id}
                  image={image}
                  brandName={review.brandName}
                  allowDownload={review.allowDownload}
                  currentName={name}
                  submit={submit}
                  onOpen={() => setLightboxId(image._id)}
                />
              ))}
            </div>
          </>
        )}
      </main>

      <PageFooter />

      <Lightbox
        images={images}
        index={lightboxIndex}
        brandName={review.brandName}
        allowDownload={review.allowDownload}
        currentName={name}
        submit={submit}
        onNavigate={(index) => setLightboxId(images[index]?._id ?? null)}
        onClose={() => setLightboxId(null)}
      />
    </div>
  );
}

function SummaryText({
  total,
  approved,
  changes,
}: {
  total: number;
  approved: number;
  changes: number;
}) {
  if (total > 0 && approved === total) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        <CircleCheck className="size-4" />
        All {total} ads approved. Thank you!
      </p>
    );
  }
  return (
    <p className="text-sm">
      <span className="font-medium">
        {approved} of {total}
      </span>{" "}
      <span className="text-muted-foreground">approved</span>
      {changes > 0 && (
        <>
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium text-amber-700 dark:text-amber-300">
            {changes} {changes === 1 ? "needs" : "need"} changes
          </span>
        </>
      )}
    </p>
  );
}

function ProgressBar({
  total,
  approved,
  changes,
  className,
}: {
  total: number;
  approved: number;
  changes: number;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${approved} approved, ${changes} need changes, ${total - approved - changes} not reviewed`}
      className={cn("flex h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="bg-emerald-500 transition-[width] duration-300"
        style={{ width: `${(approved / total) * 100}%` }}
      />
      <div
        className="bg-amber-500 transition-[width] duration-300"
        style={{ width: `${(changes / total) * 100}%` }}
      />
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────

function ReviewCard({
  image,
  brandName,
  allowDownload,
  currentName,
  submit,
  onOpen,
}: {
  image: ReviewImage;
  brandName: string;
  allowDownload: boolean;
  currentName: string;
  submit: Submit;
  onOpen: () => void;
}) {
  const verdict = image.feedback?.verdict;
  return (
    <figure
      className={cn(
        "mb-3 break-inside-avoid overflow-hidden rounded-lg border bg-card transition-colors",
        verdict === "approved"
          ? "border-emerald-500/50"
          : verdict === "changes"
            ? "border-amber-500/50"
            : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${image.templateName} larger`}
        className="relative block w-full cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.templateName}
          width={image.width}
          height={image.height}
          loading="lazy"
          className="h-auto w-full"
        />
        {verdict && (
          <span
            className={cn(
              "absolute top-2 right-2 flex size-6 items-center justify-center rounded-full text-white shadow-md",
              verdict === "approved" ? "bg-emerald-500" : "bg-amber-500",
            )}
          >
            {verdict === "approved" ? (
              <Check className="size-3.5" strokeWidth={3} />
            ) : (
              <PencilLine className="size-3.5" strokeWidth={2.5} />
            )}
          </span>
        )}
      </button>
      <figcaption className="@container space-y-2 border-t border-border p-2.5">
        <div className="flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-xs font-medium"
            title={image.templateName}
          >
            {image.templateName}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {image.aspectRatio}
          </span>
          {allowDownload && (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Download"
              aria-label={`Download ${image.templateName}`}
              className="-my-1 text-muted-foreground"
              onClick={() => void downloadImage(image, brandName)}
            >
              <Download />
            </Button>
          )}
        </div>
        <FeedbackControls
          image={image}
          currentName={currentName}
          submit={submit}
        />
      </figcaption>
    </figure>
  );
}

function FeedbackControls({
  image,
  currentName,
  submit,
}: {
  image: ReviewImage;
  currentName: string;
  submit: Submit;
}) {
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const verdict = image.feedback?.verdict;

  function choose(next: Verdict) {
    const value = verdict === next ? null : next;
    void submit(image._id, { verdict: value });
    if (value === "changes" && !image.feedback?.comment) {
      commentRef.current?.focus();
    }
  }

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label="Your verdict"
        className="grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
      >
        <VerdictButton
          active={verdict === "approved"}
          tone="approved"
          onClick={() => choose("approved")}
        >
          <CircleCheck className="hidden size-3.5 shrink-0 @min-[11rem]:block" />
          Approve
        </VerdictButton>
        <VerdictButton
          active={verdict === "changes"}
          tone="changes"
          onClick={() => choose("changes")}
        >
          <PencilLine className="hidden size-3.5 shrink-0 @min-[11rem]:block" />
          <span className="@min-[16.5rem]:hidden">Changes</span>
          <span className="hidden @min-[16.5rem]:inline">Request changes</span>
        </VerdictButton>
      </div>
      <CommentField
        ref={commentRef}
        image={image}
        currentName={currentName}
        submit={submit}
        placeholder={
          verdict === "changes" ? "What should change?" : "Add a comment"
        }
      />
    </div>
  );
}

function VerdictButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: Verdict;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-md px-1.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        !active &&
          "text-muted-foreground hover:bg-background/70 hover:text-foreground",
        active &&
          tone === "approved" &&
          "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/40 ring-inset dark:text-emerald-300",
        active &&
          tone === "changes" &&
          "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/40 ring-inset dark:text-amber-300",
      )}
    >
      {children}
    </button>
  );
}

function CommentField({
  ref,
  image,
  currentName,
  submit,
  placeholder,
}: {
  ref: React.Ref<HTMLTextAreaElement>;
  image: ReviewImage;
  currentName: string;
  submit: Submit;
  placeholder: string;
}) {
  const saved = image.feedback?.comment ?? "";
  // null while not editing: the field then mirrors the live saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const cancelled = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function commit() {
    if (draft === null) return;
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const next = draft.trim();
    setDraft(null);
    if (next === saved) return;
    setStatus("saving");
    const ok = await submit(image._id, { comment: next });
    if (!ok) {
      setStatus("idle");
      setDraft(draft); // keep their words so nothing is lost
      return;
    }
    setStatus("saved");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setStatus("idle"), 2000);
  }

  const author = image.feedback?.reviewerName;
  const showAuthor =
    draft === null &&
    saved !== "" &&
    author !== undefined &&
    author !== currentName.trim();

  return (
    <div className="space-y-1">
      <Textarea
        ref={ref}
        rows={1}
        maxLength={1000}
        aria-label={`Comment on ${image.templateName}`}
        placeholder={placeholder}
        value={draft ?? saved}
        onFocus={() => setDraft((current) => current ?? saved)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            cancelled.current = true;
            event.currentTarget.blur();
          }
        }}
        className="max-h-40 min-h-8 resize-none px-2 py-1.5 md:text-xs"
      />
      {(status !== "idle" || showAuthor) && (
        <div className="flex h-4 items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{showAuthor && `From ${author}`}</span>
          {status === "saving" && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Saving
            </span>
          )}
          {status === "saved" && (
            <span className="inline-flex shrink-0 items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="size-3" />
              Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────

function Lightbox({
  images,
  index,
  brandName,
  allowDownload,
  currentName,
  submit,
  onNavigate,
  onClose,
}: {
  images: ReviewImage[];
  index: number;
  brandName: string;
  allowDownload: boolean;
  currentName: string;
  submit: Submit;
  onNavigate: (index: number) => void;
  onClose: () => void;
}) {
  const image = index >= 0 ? images[index] : undefined;
  const count = images.length;
  const step = (delta: number) => onNavigate((index + delta + count) % count);

  return (
    <Dialog open={image !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("textarea, input")) return;
          if (event.key === "ArrowLeft") step(-1);
          if (event.key === "ArrowRight") step(1);
        }}
      >
        {image && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                <span className="truncate">{image.templateName}</span>
                <Badge
                  variant="outline"
                  className="h-4.5 px-1.5 text-[10px] text-muted-foreground"
                >
                  {image.aspectRatio}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {index + 1} of {count} · {image.width}×{image.height}
              </DialogDescription>
            </DialogHeader>

            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.templateName}
                className="mx-auto max-h-[60vh] w-auto rounded-lg border border-border"
              />
              {count > 1 && (
                <>
                  <NavButton
                    side="left"
                    label="Previous ad"
                    onClick={() => step(-1)}
                  />
                  <NavButton
                    side="right"
                    label="Next ad"
                    onClick={() => step(1)}
                  />
                </>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="@container min-w-0 flex-1">
                <FeedbackControls
                  key={image._id}
                  image={image}
                  currentName={currentName}
                  submit={submit}
                />
              </div>
              {allowDownload && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => void downloadImage(image, brandName)}
                >
                  <Download className="size-4" />
                  Download
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NavButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 size-9 -translate-y-1/2 rounded-full bg-background/80 shadow-md backdrop-blur-sm",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      <Icon className="size-4" />
    </Button>
  );
}
