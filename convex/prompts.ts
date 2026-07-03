import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { ownedProject, requireProject } from "./lib/access";
import { aspectRatio } from "./schema";

const promptDoc = v.object({
  _id: v.id("prompts"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  templateNumber: v.number(),
  templateName: v.string(),
  prompt: v.string(),
  aspectRatio,
  needsProductImages: v.boolean(),
  notes: v.optional(v.string()),
});

export const listForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.array(promptDoc),
  handler: async (ctx, args) => {
    if ((await ownedProject(ctx, args.projectId)) === null) return [];
    const prompts = await ctx.db
      .query("prompts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return prompts.sort((a, b) => a.templateNumber - b.templateNumber);
  },
});

export const update = mutation({
  args: {
    promptId: v.id("prompts"),
    prompt: v.optional(v.string()),
    aspectRatio: v.optional(aspectRatio),
    needsProductImages: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.promptId);
    if (!doc) throw new ConvexError("Prompt not found");
    const { project } = await requireProject(ctx, doc.projectId);
    if (project.status === "generating") {
      throw new ConvexError("Wait for generation to finish before editing.");
    }
    await ctx.db.patch(args.promptId, {
      ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
      ...(args.aspectRatio !== undefined
        ? { aspectRatio: args.aspectRatio }
        : {}),
      ...(args.needsProductImages !== undefined
        ? { needsProductImages: args.needsProductImages }
        : {}),
      ...(args.notes !== undefined
        ? { notes: args.notes.trim() || undefined }
        : {}),
    });
    return null;
  },
});

export const setPrompting = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      status: "prompting",
      promptError: undefined,
    });
    return null;
  },
});

export const setPromptError = internalMutation({
  args: { projectId: v.id("projects"), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      status: "research_ready",
      promptError: args.message,
    });
    return null;
  },
});

/** Replaces the project's prompts with a freshly generated set. */
export const replaceAll = internalMutation({
  args: {
    projectId: v.id("projects"),
    prompts: v.array(
      v.object({
        templateNumber: v.number(),
        templateName: v.string(),
        prompt: v.string(),
        aspectRatio,
        needsProductImages: v.boolean(),
        notes: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("prompts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const doc of old) await ctx.db.delete(doc._id);
    // Old jobs reference deleted prompts; clear them. Generated images
    // carry their own copies and survive.
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const job of jobs) await ctx.db.delete(job._id);
    for (const prompt of args.prompts) {
      await ctx.db.insert("prompts", { projectId: args.projectId, ...prompt });
    }
    await ctx.db.patch(args.projectId, {
      status: "prompts_ready",
      promptError: undefined,
    });
    return null;
  },
});
