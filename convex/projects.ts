import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  currentUser,
  ownedProject,
  requireProject,
  requireUser,
} from "./lib/access";
import { projectStatus } from "./schema";
import { deleteProjectContents } from "./users";

const projectDoc = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  brandName: v.string(),
  brandUrl: v.string(),
  productName: v.string(),
  status: projectStatus,
  selectedTemplateIds: v.optional(v.array(v.id("templates"))),
  researchError: v.optional(v.string()),
  promptError: v.optional(v.string()),
});

export const list = query({
  args: {},
  returns: v.array(projectDoc),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null) return [];
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return projects;
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  returns: v.union(projectDoc, v.null()),
  handler: async (ctx, args) => {
    const owned = await ownedProject(ctx, args.projectId);
    return owned?.project ?? null;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    brandName: v.string(),
    brandUrl: v.string(),
    productName: v.string(),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    const brandName = args.brandName.trim();
    const brandUrl = args.brandUrl.trim();
    const productName = args.productName.trim();
    if (!name || !brandName || !brandUrl || !productName) {
      throw new ConvexError("All fields are required.");
    }
    return await ctx.db.insert("projects", {
      userId: user._id,
      name,
      brandName,
      brandUrl,
      productName,
      status: "setup",
    });
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    brandName: v.optional(v.string()),
    brandUrl: v.optional(v.string()),
    productName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    const patch: Record<string, string> = {};
    for (const field of [
      "name",
      "brandName",
      "brandUrl",
      "productName",
    ] as const) {
      const value = args[field]?.trim();
      if (value) patch[field] = value;
    }
    await ctx.db.patch(args.projectId, patch);
    return null;
  },
});

export const setSelectedTemplates = mutation({
  args: {
    projectId: v.id("projects"),
    templateIds: v.array(v.id("templates")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    await ctx.db.patch(args.projectId, {
      selectedTemplateIds: args.templateIds,
    });
    return null;
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.projectId);
    if (project.status === "generating") {
      throw new ConvexError(
        "Wait for generation to finish before deleting this project.",
      );
    }
    await deleteProjectContents(ctx, args.projectId);
    await ctx.db.delete(args.projectId);
    return null;
  },
});

/** Owner-checked project fetch for use from actions via runQuery. */
export const getOwned = internalQuery({
  args: { projectId: v.id("projects") },
  returns: projectDoc,
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.projectId);
    return project;
  },
});

export const setStatus = internalMutation({
  args: { projectId: v.id("projects"), status: projectStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { status: args.status });
    return null;
  },
});
