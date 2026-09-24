import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { ownedProject, requireProject } from "./lib/access";

/**
 * Client-review links. The owner mints a tokenised link to a project's
 * gallery; anyone holding it can view the finished ads (never prompts)
 * and leave per-image feedback without an account.
 */

const verdictValidator = v.union(v.literal("approved"), v.literal("changes"));

const MAX_LABEL = 80;
const MAX_COMMENT = 1000;
const MAX_NAME = 80;

const feedbackCounts = v.object({
  approved: v.number(),
  changes: v.number(),
  commented: v.number(),
});

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function clean(text: string | undefined, max: number): string | undefined {
  const trimmed = text?.trim().slice(0, max).trim();
  return trimmed ? trimmed : undefined;
}

/** The share behind a token, only while it is switched on. */
async function activeShare(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<Doc<"shares"> | null> {
  // Tokens are 48 hex chars; anything else can't match, skip the read.
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const share = await ctx.db
    .query("shares")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  return share !== null && share.active ? share : null;
}

async function feedbackRows(
  ctx: QueryCtx | MutationCtx,
  shareId: Id<"shares">,
): Promise<Doc<"shareFeedback">[]> {
  return await ctx.db
    .query("shareFeedback")
    .withIndex("by_share", (q) => q.eq("shareId", shareId))
    .collect();
}

/** Ids of the images currently in a project (feedback can outlive them). */
async function projectImageIds(
  ctx: QueryCtx,
  projectId: Id<"projects">,
): Promise<Set<Id<"images">>> {
  const images = await ctx.db
    .query("images")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  return new Set(images.map((image) => image._id));
}

/** Deletes a share and every feedback row left through it. */
export async function deleteShareAndFeedback(
  ctx: Pick<MutationCtx, "db">,
  shareId: Id<"shares">,
): Promise<void> {
  const rows = await ctx.db
    .query("shareFeedback")
    .withIndex("by_share", (q) => q.eq("shareId", shareId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
  await ctx.db.delete(shareId);
}

// ─── Owner side ────────────────────────────────────────────────────────────

export const listForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("shares"),
      _creationTime: v.number(),
      token: v.string(),
      label: v.optional(v.string()),
      active: v.boolean(),
      allowDownload: v.boolean(),
      counts: feedbackCounts,
    }),
  ),
  handler: async (ctx, args) => {
    if ((await ownedProject(ctx, args.projectId)) === null) return [];
    const shares = await ctx.db
      .query("shares")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    if (shares.length === 0) return [];
    const imageIds = await projectImageIds(ctx, args.projectId);
    return await Promise.all(
      shares.map(async (share) => {
        const rows = (await feedbackRows(ctx, share._id)).filter((row) =>
          imageIds.has(row.imageId),
        );
        return {
          _id: share._id,
          _creationTime: share._creationTime,
          token: share.token,
          label: share.label,
          active: share.active,
          allowDownload: share.allowDownload,
          counts: {
            approved: rows.filter((row) => row.verdict === "approved").length,
            changes: rows.filter((row) => row.verdict === "changes").length,
            commented: rows.filter((row) => row.comment !== undefined).length,
          },
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    label: v.optional(v.string()),
    allowDownload: v.boolean(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    const token = generateToken();
    await ctx.db.insert("shares", {
      projectId: args.projectId,
      token,
      label: clean(args.label, MAX_LABEL),
      active: true,
      allowDownload: args.allowDownload,
    });
    return token;
  },
});

export const update = mutation({
  args: {
    shareId: v.id("shares"),
    active: v.optional(v.boolean()),
    allowDownload: v.optional(v.boolean()),
    label: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const share = await ctx.db.get(args.shareId);
    if (!share) throw new ConvexError("Review link not found");
    await requireProject(ctx, share.projectId);
    const patch: Partial<Doc<"shares">> = {};
    if (args.active !== undefined) patch.active = args.active;
    if (args.allowDownload !== undefined) {
      patch.allowDownload = args.allowDownload;
    }
    // An empty label clears it (patching a field to undefined removes it).
    if (args.label !== undefined) patch.label = clean(args.label, MAX_LABEL);
    await ctx.db.patch(args.shareId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { shareId: v.id("shares") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const share = await ctx.db.get(args.shareId);
    if (!share) throw new ConvexError("Review link not found");
    await requireProject(ctx, share.projectId);
    await deleteShareAndFeedback(ctx, args.shareId);
    return null;
  },
});

/**
 * Latest client feedback per image across the project's active links,
 * for gallery badges. Feedback rows are re-inserted on every change
 * (see submitFeedback), so _creationTime is the last-updated time.
 */
export const feedbackForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      imageId: v.id("images"),
      verdict: v.optional(verdictValidator),
      comment: v.optional(v.string()),
      reviewerName: v.optional(v.string()),
      shareLabel: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    if ((await ownedProject(ctx, args.projectId)) === null) return [];
    const shares = (
      await ctx.db
        .query("shares")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect()
    ).filter((share) => share.active);
    if (shares.length === 0) return [];
    const imageIds = await projectImageIds(ctx, args.projectId);

    const latest = new Map<
      Id<"images">,
      { row: Doc<"shareFeedback">; shareLabel?: string }
    >();
    for (const share of shares) {
      for (const row of await feedbackRows(ctx, share._id)) {
        if (!imageIds.has(row.imageId)) continue;
        const current = latest.get(row.imageId);
        if (!current || row._creationTime > current.row._creationTime) {
          latest.set(row.imageId, { row, shareLabel: share.label });
        }
      }
    }
    return Array.from(latest.values(), ({ row, shareLabel }) => ({
      imageId: row.imageId,
      verdict: row.verdict,
      comment: row.comment,
      reviewerName: row.reviewerName,
      shareLabel,
    }));
  },
});

// ─── Public side (token holders, no account) ──────────────────────────────

/**
 * Public review page data. Returns null for unknown or switched-off
 * links. Deliberately exposes only what a client needs to review:
 * no prompt text, and no ids other than image ids.
 */
export const view = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      projectName: v.string(),
      brandName: v.string(),
      productName: v.string(),
      allowDownload: v.boolean(),
      label: v.optional(v.string()),
      images: v.array(
        v.object({
          _id: v.id("images"),
          templateName: v.string(),
          aspectRatio: v.string(),
          width: v.number(),
          height: v.number(),
          url: v.string(),
          feedback: v.union(
            v.null(),
            v.object({
              verdict: v.optional(verdictValidator),
              comment: v.optional(v.string()),
              reviewerName: v.optional(v.string()),
            }),
          ),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const share = await activeShare(ctx, args.token);
    if (share === null) return null;
    const project = await ctx.db.get(share.projectId);
    if (project === null) return null;

    const feedback = new Map(
      (await feedbackRows(ctx, share._id)).map((row) => [row.imageId, row]),
    );
    const images = await ctx.db
      .query("images")
      .withIndex("by_project", (q) => q.eq("projectId", share.projectId))
      .order("desc")
      .collect();
    const withUrls = await Promise.all(
      images.map(async (image) => {
        const url = await ctx.storage.getUrl(image.storageId);
        if (url === null) return null;
        const row = feedback.get(image._id);
        return {
          _id: image._id,
          templateName: image.templateName,
          aspectRatio: image.aspectRatio,
          width: image.width,
          height: image.height,
          url,
          feedback: row
            ? {
                verdict: row.verdict,
                comment: row.comment,
                reviewerName: row.reviewerName,
              }
            : null,
        };
      }),
    );

    return {
      projectName: project.name,
      brandName: project.brandName,
      productName: project.productName,
      allowDownload: share.allowDownload,
      label: share.label,
      images: withUrls.filter((image) => image !== null),
    };
  },
});

/**
 * Public: record a reviewer's verdict and/or comment on one image.
 * Omitted fields are left as they are; a null verdict or an empty
 * comment clears it. A row with neither is removed.
 */
export const submitFeedback = mutation({
  args: {
    token: v.string(),
    imageId: v.id("images"),
    verdict: v.optional(v.union(verdictValidator, v.null())),
    comment: v.optional(v.string()),
    reviewerName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const share = await activeShare(ctx, args.token);
    if (share === null) {
      throw new ConvexError(
        "This review link is no longer available. Ask whoever sent it for a new one.",
      );
    }
    const image = await ctx.db.get(args.imageId);
    if (image === null || image.projectId !== share.projectId) {
      throw new ConvexError("This ad is no longer part of the review.");
    }

    const existing = await ctx.db
      .query("shareFeedback")
      .withIndex("by_share_image", (q) =>
        q.eq("shareId", share._id).eq("imageId", args.imageId),
      )
      .first();

    const verdict =
      args.verdict === undefined
        ? existing?.verdict
        : (args.verdict ?? undefined);
    const comment =
      args.comment === undefined
        ? existing?.comment
        : clean(args.comment, MAX_COMMENT);
    const reviewerName =
      args.reviewerName === undefined
        ? existing?.reviewerName
        : clean(args.reviewerName, MAX_NAME);

    if (verdict === undefined && comment === undefined) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }
    if (
      existing &&
      existing.verdict === verdict &&
      existing.comment === comment &&
      existing.reviewerName === reviewerName
    ) {
      return null;
    }
    // Replace rather than patch so _creationTime doubles as "last
    // updated", which feedbackForProject uses to pick the latest word.
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("shareFeedback", {
      shareId: share._id,
      imageId: args.imageId,
      verdict,
      comment,
      reviewerName,
    });
    return null;
  },
});
