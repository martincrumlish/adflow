import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { concurrencyCap } from "./generation";
import { requireProject } from "./lib/access";
import { assertWithinQuota } from "./lib/quota";
import { aspectRatio, jobQuality } from "./schema";

/**
 * Placement spin-offs: re-render a finished ad in the other aspect
 * ratios. Each spin-off is an ordinary queued job that carries the
 * source image and the target ratio; the worker pool picks it up like
 * any other job and uses the source image as the content reference.
 */
export const create = mutation({
  args: {
    imageId: v.id("images"),
    aspectRatios: v.array(aspectRatio),
    quality: v.optional(jobQuality),
  },
  // How many new sizes were queued.
  returns: v.number(),
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (!image) throw new ConvexError("This image no longer exists.");
    const { project } = await requireProject(ctx, image.projectId);
    if (project.status === "researching" || project.status === "prompting") {
      throw new ConvexError(
        "Wait for the current step to finish before making new sizes.",
      );
    }

    const wanted = [...new Set(args.aspectRatios)].filter(
      (ratio) => ratio !== image.aspectRatio,
    );
    if (wanted.length === 0) {
      throw new ConvexError("Pick at least one size this ad isn't in yet.");
    }

    const active = [
      ...(await ctx.db
        .query("jobs")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", image.projectId).eq("status", "queued"),
        )
        .collect()),
      ...(await ctx.db
        .query("jobs")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", image.projectId).eq("status", "running"),
        )
        .collect()),
    ];
    const inFlight = wanted.filter((ratio) =>
      active.some(
        (job) =>
          job.sourceImageId === args.imageId &&
          job.aspectRatioOverride === ratio,
      ),
    );
    if (inFlight.length > 0) {
      throw new ConvexError(
        `The ${inFlight.join(" and ")} version of this ad is already being made.`,
      );
    }
    // Spin-offs are ordinary renders as far as the plan is concerned.
    await assertWithinQuota(ctx, project.userId, wanted.length);

    for (const ratio of wanted) {
      await ctx.db.insert("jobs", {
        projectId: image.projectId,
        promptId: image.promptId,
        status: "queued",
        quality: args.quality ?? "high",
        sourceImageId: args.imageId,
        aspectRatioOverride: ratio,
      });
    }
    if (project.status !== "generating") {
      await ctx.db.patch(image.projectId, { status: "generating" });
    }
    const workers = Math.min(concurrencyCap(), wanted.length);
    for (let i = 0; i < workers; i++) {
      await ctx.scheduler.runAfter(
        i * 250,
        internal.generationWorker.processQueue,
        { projectId: image.projectId },
      );
    }
    return wanted.length;
  },
});
