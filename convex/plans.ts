import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentAdmin, requireAdmin } from "./lib/access";

export const adminList = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("plans"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.optional(v.string()),
      active: v.boolean(),
      userCount: v.number(),
      linkCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    if ((await currentAdmin(ctx)) === null) return [];
    const plans = await ctx.db.query("plans").collect();
    const users = await ctx.db.query("users").collect();
    const links = await ctx.db.query("signupLinks").collect();
    return plans
      .map((plan) => ({
        ...plan,
        userCount: users.filter((u) => u.planId === plan._id).length,
        linkCount: links.filter((l) => l.planId === plan._id).length,
      }))
      .sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.id("plans"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Plan name is required.");
    return await ctx.db.insert("plans", {
      name,
      description: args.description?.trim() || undefined,
      active: true,
    });
  },
});

export const update = mutation({
  args: {
    planId: v.id("plans"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new ConvexError("Plan not found");
    await ctx.db.patch(args.planId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.description !== undefined
        ? { description: args.description.trim() || undefined }
        : {}),
      ...(args.active !== undefined ? { active: args.active } : {}),
    });
    return null;
  },
});
