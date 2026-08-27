import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { currentUser, requireUser } from "./lib/access";
import { encryptSecret } from "./lib/secretbox";

const provider = v.union(v.literal("openrouter"), v.literal("fal"));

/** Masked view for the profile page — never exposes ciphertext. */
export const status = query({
  args: {},
  returns: v.object({
    openrouter: v.union(v.string(), v.null()),
    fal: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null) return { openrouter: null, fal: null };
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", user._id))
      .collect();
    const last4 = (p: "openrouter" | "fal") =>
      rows.find((r) => r.provider === p)?.last4 ?? null;
    return { openrouter: last4("openrouter"), fal: last4("fal") };
  },
});

/** Encrypts in the action runtime, stores via the internal mutation. */
export const save = action({
  args: { provider, key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = args.key.trim();
    if (key.length < 8) {
      throw new ConvexError("That doesn't look like a valid API key.");
    }
    const ciphertext = await encryptSecret(key);
    await ctx.runMutation(internal.apiKeys.store, {
      provider: args.provider,
      ciphertext,
      last4: key.slice(-4),
    });
    return null;
  },
});

export const store = internalMutation({
  args: { provider, ciphertext: v.string(), last4: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ciphertext: args.ciphertext,
        last4: args.last4,
      });
    } else {
      await ctx.db.insert("apiKeys", {
        userId: user._id,
        provider: args.provider,
        ciphertext: args.ciphertext,
        last4: args.last4,
      });
    }
    return null;
  },
});

export const remove = mutation({
  args: { provider },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/**
 * Ciphertexts for a project's owner, for the pipeline actions (they
 * decrypt server-side and fall back to the shared env keys).
 */
export const ciphertextsForProject = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    openrouter: v.union(v.string(), v.null()),
    fal: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { openrouter: null, fal: null };
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", project.userId))
      .collect();
    const find = (p: "openrouter" | "fal") =>
      rows.find((r) => r.provider === p)?.ciphertext ?? null;
    return { openrouter: find("openrouter"), fal: find("fal") };
  },
});
