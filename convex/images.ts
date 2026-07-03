import { v } from "convex/values";
import { query } from "./_generated/server";
import { ownedProject } from "./lib/access";

export const gallery = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("images"),
      _creationTime: v.number(),
      promptId: v.id("prompts"),
      templateName: v.string(),
      promptText: v.string(),
      aspectRatio: v.string(),
      width: v.number(),
      height: v.number(),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    if ((await ownedProject(ctx, args.projectId)) === null) return [];
    const images = await ctx.db
      .query("images")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    return await Promise.all(
      images.map(async (image) => ({
        _id: image._id,
        _creationTime: image._creationTime,
        promptId: image.promptId,
        templateName: image.templateName,
        promptText: image.promptText,
        aspectRatio: image.aspectRatio,
        width: image.width,
        height: image.height,
        url: await ctx.storage.getUrl(image.storageId),
      })),
    );
  },
});
