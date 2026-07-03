import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentAdmin, requireAdmin } from "./lib/access";

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const adminList = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("signupLinks"),
      _creationTime: v.number(),
      token: v.string(),
      planId: v.id("plans"),
      label: v.optional(v.string()),
      active: v.boolean(),
      planName: v.string(),
    }),
  ),
  handler: async (ctx) => {
    if ((await currentAdmin(ctx)) === null) return [];
    const links = await ctx.db.query("signupLinks").collect();
    const plans = await ctx.db.query("plans").collect();
    const planName = new Map(plans.map((p) => [p._id, p.name]));
    return links
      .map((link) => ({
        ...link,
        planName: planName.get(link.planId) ?? "(deleted plan)",
      }))
      .sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const create = mutation({
  args: {
    planId: v.id("plans"),
    label: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new ConvexError("Plan not found");
    const token = generateToken();
    await ctx.db.insert("signupLinks", {
      token,
      planId: args.planId,
      label: args.label?.trim() || undefined,
      active: true,
    });
    return token;
  },
});

export const setActive = mutation({
  args: { linkId: v.id("signupLinks"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new ConvexError("Signup link not found");
    await ctx.db.patch(args.linkId, { active: args.active });
    return null;
  },
});

/**
 * Public: used by the signup page to show whether a token is usable
 * and which plan it grants. Exposes nothing but validity + plan name.
 */
export const validate = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({ valid: v.literal(false) }),
    v.object({ valid: v.literal(true), planName: v.string() }),
  ),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("signupLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!link || !link.active) return { valid: false as const };
    const plan = await ctx.db.get(link.planId);
    return { valid: true as const, planName: plan?.name ?? "Member" };
  },
});
