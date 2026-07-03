import { createAccount, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { currentAdmin, isAdminUser, requireAdmin } from "./lib/access";

export const viewer = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
      isAdmin: v.boolean(),
      planName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    const plan = user.planId ? await ctx.db.get(user.planId) : null;
    return {
      _id: user._id,
      email: user.email,
      isAdmin: isAdminUser(user),
      planName: plan?.name ?? null,
    };
  },
});

export const adminList = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      email: v.string(),
      role: v.union(v.literal("admin"), v.literal("user")),
      isAdmin: v.boolean(),
      planId: v.union(v.id("plans"), v.null()),
      planName: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    if ((await currentAdmin(ctx)) === null) return [];
    const users = await ctx.db.query("users").collect();
    const plans = await ctx.db.query("plans").collect();
    const planName = new Map(plans.map((p) => [p._id, p.name]));
    return users.map((u) => ({
      _id: u._id,
      email: u.email ?? "(no email)",
      role: u.role ?? ("user" as const),
      isAdmin: isAdminUser(u),
      planId: u.planId ?? null,
      planName: u.planId ? (planName.get(u.planId) ?? null) : null,
      createdAt: u._creationTime,
    }));
  },
});

export const adminUpdate = mutation({
  args: {
    userId: v.id("users"),
    planId: v.union(v.id("plans"), v.null()),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("User not found");
    if (admin._id === args.userId && args.role !== "admin") {
      throw new ConvexError("You cannot remove your own admin role.");
    }
    await ctx.db.patch(args.userId, {
      planId: args.planId ?? undefined,
      role: args.role,
    });
    return null;
  },
});

export const adminDelete = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.userId) {
      throw new ConvexError("You cannot delete your own account.");
    }
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("User not found");

    // Cascade: the user's projects and everything under them.
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const project of projects) {
      await deleteProjectContents(ctx, project._id);
      await ctx.db.delete(project._id);
    }
    const templates = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const t of templates) await ctx.db.delete(t._id);

    // Auth bookkeeping: accounts, verification codes, sessions and
    // their refresh tokens.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) await ctx.db.delete(code._id);
      await ctx.db.delete(account._id);
    }
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of refreshTokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    await ctx.db.delete(args.userId);
    return null;
  },
});

export const assertAdmin = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return true;
  },
});

export const emailTaken = internalQuery({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();
    return existing !== null;
  },
});

export const adminCreate = action({
  args: {
    email: v.string(),
    password: v.string(),
    planId: v.union(v.id("plans"), v.null()),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.users.assertAdmin, {});
    const email = args.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }
    if (args.password.length < 8) {
      throw new ConvexError("Password must be at least 8 characters.");
    }
    if (await ctx.runQuery(internal.users.emailTaken, { email })) {
      throw new ConvexError("An account with this email already exists.");
    }
    await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        role: args.role,
        planId: args.planId ?? undefined,
        adminProvisioned: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });
    return null;
  },
});

/**
 * Deletes everything belonging to a project (rows + stored files),
 * but not the project itself. Shared by user deletion and project
 * deletion.
 */
export async function deleteProjectContents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any; storage: any },
  projectId: Id<"projects">,
) {
  const byProject = (table: string) =>
    ctx.db
      .query(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .collect();

  for (const image of await byProject("images")) {
    await ctx.storage.delete(image.storageId);
    await ctx.db.delete(image._id);
  }
  for (const job of await byProject("jobs")) await ctx.db.delete(job._id);
  for (const prompt of await byProject("prompts"))
    await ctx.db.delete(prompt._id);
  for (const dna of await byProject("brandDna")) await ctx.db.delete(dna._id);
  for (const productImage of await byProject("productImages")) {
    await ctx.storage.delete(productImage.storageId);
    await ctx.db.delete(productImage._id);
  }
}
