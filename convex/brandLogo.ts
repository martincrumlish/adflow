import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { ownedProject, requireProject } from "./lib/access";

/**
 * Brand logo: one image per project, attached to every render as a
 * reference so the image model reproduces the real mark instead of
 * redrawing it. Uploads reuse `api.productImages.generateUploadUrl`.
 */

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_BYTES = 10 * 1024 * 1024;

export const set = mutation({
  args: { projectId: v.id("projects"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.projectId);
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file) throw new ConvexError("The upload did not arrive. Try again.");
    if (!file.contentType || !ACCEPTED_TYPES.includes(file.contentType)) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("Logos must be PNG, JPG, or WebP images.");
    }
    if (file.size > MAX_LOGO_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("That logo is over 10 MB. Try a smaller file.");
    }
    if (project.logoImageId && project.logoImageId !== args.storageId) {
      await ctx.storage.delete(project.logoImageId);
    }
    await ctx.db.patch(args.projectId, {
      logoImageId: args.storageId,
      logoFalUrl: undefined,
    });
    return null;
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.projectId);
    if (project.logoImageId) await ctx.storage.delete(project.logoImageId);
    await ctx.db.patch(args.projectId, {
      logoImageId: undefined,
      logoFalUrl: undefined,
    });
    return null;
  },
});

export const url = query({
  args: { projectId: v.id("projects") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const owned = await ownedProject(ctx, args.projectId);
    if (owned === null || !owned.project.logoImageId) return null;
    return await ctx.storage.getUrl(owned.project.logoImageId);
  },
});

/**
 * Cache the FAL storage URL so the logo uploads to FAL once. Only
 * written if the logo wasn't replaced while the worker was uploading.
 */
export const setFalUrl = internalMutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    falUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project && project.logoImageId === args.storageId) {
      await ctx.db.patch(args.projectId, { logoFalUrl: args.falUrl });
    }
    return null;
  },
});
