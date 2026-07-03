import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireProject } from "./lib/access";
import { aspectRatio, jobQuality } from "./schema";

/** A running job older than this is considered dead and gets failed. */
const STALE_JOB_MS = 15 * 60 * 1000;

export const jobsForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("jobs"),
      promptId: v.id("prompts"),
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("done"),
        v.literal("error"),
      ),
      quality: jobQuality,
      error: v.optional(v.string()),
      templateName: v.string(),
      templateNumber: v.number(),
      aspectRatio: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const result = [];
    for (const job of jobs) {
      const prompt = await ctx.db.get(job.promptId);
      result.push({
        _id: job._id,
        promptId: job.promptId,
        status: job.status,
        quality: job.quality,
        error: job.error,
        templateName: prompt?.templateName ?? "(deleted prompt)",
        templateNumber: prompt?.templateNumber ?? 0,
        aspectRatio: prompt?.aspectRatio ?? "1:1",
      });
    }
    return result.sort((a, b) => a.templateNumber - b.templateNumber);
  },
});

export const start = mutation({
  args: {
    projectId: v.id("projects"),
    quality: jobQuality,
    promptIds: v.optional(v.array(v.id("prompts"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.projectId);
    const active = await activeJobs(ctx, args.projectId);
    if (active.length > 0) {
      throw new ConvexError("Generation is already running.");
    }
    const allPrompts = await ctx.db
      .query("prompts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const wanted = args.promptIds
      ? allPrompts.filter((p) => args.promptIds!.includes(p._id))
      : allPrompts;
    if (wanted.length === 0) {
      throw new ConvexError("No prompts selected. Generate prompts first.");
    }
    // Clear finished jobs so the Generate view shows only this run.
    const oldJobs = await ctx.db
      .query("jobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const job of oldJobs) await ctx.db.delete(job._id);
    for (const prompt of wanted.sort(
      (a, b) => a.templateNumber - b.templateNumber,
    )) {
      await ctx.db.insert("jobs", {
        projectId: args.projectId,
        promptId: prompt._id,
        status: "queued",
        quality: args.quality,
      });
    }
    if (project.status !== "generating") {
      await ctx.db.patch(args.projectId, { status: "generating" });
    }
    await ctx.scheduler.runAfter(0, internal.generationWorker.processQueue, {
      projectId: args.projectId,
    });
    return null;
  },
});

export const regenerateOne = mutation({
  args: {
    promptId: v.id("prompts"),
    quality: v.optional(jobQuality),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.promptId);
    if (!prompt) {
      throw new ConvexError(
        "The prompt behind this image no longer exists. Re-run generation instead.",
      );
    }
    const { project } = await requireProject(ctx, prompt.projectId);
    const activeForPrompt = (await activeJobs(ctx, prompt.projectId)).filter(
      (job) => job.promptId === args.promptId,
    );
    if (activeForPrompt.length > 0) {
      throw new ConvexError("This image is already being regenerated.");
    }
    await ctx.db.insert("jobs", {
      projectId: prompt.projectId,
      promptId: args.promptId,
      status: "queued",
      quality: args.quality ?? "high",
    });
    if (project.status !== "generating") {
      await ctx.db.patch(prompt.projectId, { status: "generating" });
    }
    await ctx.scheduler.runAfter(0, internal.generationWorker.processQueue, {
      projectId: prompt.projectId,
    });
    return null;
  },
});

async function activeJobs(ctx: MutationCtx, projectId: Id<"projects">) {
  const queued = await ctx.db
    .query("jobs")
    .withIndex("by_project_status", (q) =>
      q.eq("projectId", projectId).eq("status", "queued"),
    )
    .collect();
  const running = await ctx.db
    .query("jobs")
    .withIndex("by_project_status", (q) =>
      q.eq("projectId", projectId).eq("status", "running"),
    )
    .collect();
  return [...queued, ...running];
}

/** Marks the project done when nothing is queued or running anymore. */
async function finalizeIfDrained(ctx: MutationCtx, projectId: Id<"projects">) {
  const active = await activeJobs(ctx, projectId);
  if (active.length > 0) return;
  const project = await ctx.db.get(projectId);
  if (project?.status === "generating") {
    await ctx.db.patch(projectId, { status: "done" });
  }
}

const claimedBundle = v.union(
  v.null(),
  v.object({
    job: v.object({
      _id: v.id("jobs"),
      quality: jobQuality,
    }),
    prompt: v.object({
      _id: v.id("prompts"),
      prompt: v.string(),
      aspectRatio,
      needsProductImages: v.boolean(),
      templateName: v.string(),
    }),
    productImages: v.array(
      v.object({
        _id: v.id("productImages"),
        storageId: v.id("_storage"),
        filename: v.string(),
        falUrl: v.optional(v.string()),
      }),
    ),
  }),
);

/**
 * Atomically claims the next queued job. Returns null when another job
 * is mid-flight (single-file processing, never parallel FAL calls) or
 * when the queue is drained (which also finalizes the project).
 */
export const claimNext = internalMutation({
  args: { projectId: v.id("projects") },
  returns: claimedBundle,
  handler: async (ctx, args) => {
    const running = await ctx.db
      .query("jobs")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "running"),
      )
      .collect();
    for (const job of running) {
      if ((job.startedAt ?? 0) < Date.now() - STALE_JOB_MS) {
        await ctx.db.patch(job._id, {
          status: "error",
          error: "The generation worker timed out. Try regenerating.",
          finishedAt: Date.now(),
        });
      } else {
        return null; // Someone is already processing.
      }
    }
    const next = await ctx.db
      .query("jobs")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "queued"),
      )
      .first();
    if (!next) {
      await finalizeIfDrained(ctx, args.projectId);
      return null;
    }
    const prompt = await ctx.db.get(next.promptId);
    if (!prompt) {
      await ctx.db.patch(next._id, {
        status: "error",
        error: "The prompt for this job was deleted.",
        finishedAt: Date.now(),
      });
      return null;
    }
    await ctx.db.patch(next._id, { status: "running", startedAt: Date.now() });
    const productImages = prompt.needsProductImages
      ? await ctx.db
          .query("productImages")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : [];
    return {
      job: { _id: next._id, quality: next.quality },
      prompt: {
        _id: prompt._id,
        prompt: prompt.prompt,
        aspectRatio: prompt.aspectRatio,
        needsProductImages: prompt.needsProductImages,
        templateName: prompt.templateName,
      },
      productImages: productImages.map((image) => ({
        _id: image._id,
        storageId: image.storageId,
        filename: image.filename,
        falUrl: image.falUrl,
      })),
    };
  },
});

export const completeJob = internalMutation({
  args: {
    jobId: v.id("jobs"),
    storageId: v.id("_storage"),
    width: v.number(),
    height: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    await ctx.db.patch(args.jobId, {
      status: "done",
      finishedAt: Date.now(),
      error: undefined,
    });
    const prompt = await ctx.db.get(job.promptId);
    // One image per prompt in v1: replace any previous render.
    const previous = await ctx.db
      .query("images")
      .withIndex("by_prompt", (q) => q.eq("promptId", job.promptId))
      .collect();
    for (const image of previous) {
      await ctx.storage.delete(image.storageId);
      await ctx.db.delete(image._id);
    }
    await ctx.db.insert("images", {
      projectId: job.projectId,
      promptId: job.promptId,
      jobId: args.jobId,
      storageId: args.storageId,
      templateName: prompt?.templateName ?? "template",
      promptText: prompt?.prompt ?? "",
      aspectRatio: prompt?.aspectRatio ?? "1:1",
      width: args.width,
      height: args.height,
    });
    await finalizeIfDrained(ctx, job.projectId);
    return null;
  },
});

export const failJob = internalMutation({
  args: { jobId: v.id("jobs"), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    await ctx.db.patch(args.jobId, {
      status: "error",
      error: args.message.slice(0, 500),
      finishedAt: Date.now(),
    });
    await finalizeIfDrained(ctx, job.projectId);
    return null;
  },
});

/** Inputs Phase 2 needs, gathered with an owner check. */
export const getPromptGenInputs = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    brandDna: v.union(
      v.null(),
      v.object({ document: v.string(), promptModifier: v.string() }),
    ),
    templates: v.array(
      v.object({
        number: v.number(),
        name: v.string(),
        body: v.string(),
        aspectRatio,
        needsProductImages: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.projectId);
    const dna = await ctx.db
      .query("brandDna")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    const templates = [];
    for (const templateId of project.selectedTemplateIds ?? []) {
      const template = await ctx.db.get(templateId);
      if (!template) continue;
      // Selected templates must be visible to this user.
      if (template.userId !== undefined && template.userId !== project.userId)
        continue;
      templates.push({
        number: template.number,
        name: template.name,
        body: template.body,
        aspectRatio: template.aspectRatio,
        needsProductImages: template.needsProductImages,
      });
    }
    return {
      brandDna: dna
        ? { document: dna.document, promptModifier: dna.promptModifier }
        : null,
      templates: templates.sort((a, b) => a.number - b.number),
    };
  },
});
