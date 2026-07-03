import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireProject, requireUser } from "./lib/access";

export const MAX_PRODUCT_IMAGES = 3;

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attach = mutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    filename: v.string(),
  },
  returns: v.id("productImages"),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    const existing = await ctx.db
      .query("productImages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (existing.length >= MAX_PRODUCT_IMAGES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError(
        `You can upload at most ${MAX_PRODUCT_IMAGES} product images.`,
      );
    }
    return await ctx.db.insert("productImages", {
      projectId: args.projectId,
      storageId: args.storageId,
      filename: args.filename,
    });
  },
});

export const listForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("productImages"),
      filename: v.string(),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    const images = await ctx.db
      .query("productImages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return await Promise.all(
      images.map(async (image) => ({
        _id: image._id,
        filename: image.filename,
        url: await ctx.storage.getUrl(image.storageId),
      })),
    );
  },
});

export const remove = mutation({
  args: { imageId: v.id("productImages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (!image) throw new ConvexError("Image not found");
    await requireProject(ctx, image.projectId);
    await ctx.storage.delete(image.storageId);
    await ctx.db.delete(args.imageId);
    return null;
  },
});

/** Cache the FAL storage URL so each product image uploads to FAL once. */
export const setFalUrl = internalMutation({
  args: { imageId: v.id("productImages"), falUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (image) await ctx.db.patch(args.imageId, { falUrl: args.falUrl });
    return null;
  },
});
