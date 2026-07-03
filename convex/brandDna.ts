import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireProject } from "./lib/access";

export const get = query({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("brandDna"),
      document: v.string(),
      promptModifier: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    const dna = await ctx.db
      .query("brandDna")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (!dna) return null;
    return {
      _id: dna._id,
      document: dna.document,
      promptModifier: dna.promptModifier,
    };
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    document: v.optional(v.string()),
    promptModifier: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    const dna = await ctx.db
      .query("brandDna")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (!dna) throw new ConvexError("Run brand research first.");
    await ctx.db.patch(dna._id, {
      ...(args.document !== undefined ? { document: args.document } : {}),
      ...(args.promptModifier !== undefined
        ? { promptModifier: args.promptModifier }
        : {}),
    });
    return null;
  },
});

export const setResearching = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      status: "researching",
      researchError: undefined,
    });
    return null;
  },
});

export const saveResearch = internalMutation({
  args: {
    projectId: v.id("projects"),
    document: v.string(),
    promptModifier: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brandDna")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        document: args.document,
        promptModifier: args.promptModifier,
      });
    } else {
      await ctx.db.insert("brandDna", {
        projectId: args.projectId,
        document: args.document,
        promptModifier: args.promptModifier,
      });
    }
    await ctx.db.patch(args.projectId, {
      status: "research_ready",
      researchError: undefined,
    });
    return null;
  },
});

export const setResearchError = internalMutation({
  args: { projectId: v.id("projects"), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brandDna")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    await ctx.db.patch(args.projectId, {
      status: existing ? "research_ready" : "setup",
      researchError: args.message,
    });
    return null;
  },
});
