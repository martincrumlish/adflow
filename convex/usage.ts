import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import { currentAdmin, currentUser } from "./lib/access";
import { estimateCost, monthKey } from "./lib/costs";
import { usageSummary } from "./lib/quota";
import { jobQuality } from "./schema";

const usageKind = v.union(
  v.literal("image"),
  v.literal("research"),
  v.literal("copy"),
);

const summaryShape = v.object({
  used: v.number(),
  quota: v.union(v.number(), v.null()),
  exempt: v.boolean(),
  ownKeys: v.boolean(),
  month: v.string(),
  resetsOn: v.number(),
});

/**
 * One row per successful AI call. Called by the pipeline actions after
 * their save mutation succeeds; failures are never recorded. Never
 * throws: if the project was deleted mid-run there is nothing to bill.
 */
export const recordEvent = internalMutation({
  args: {
    projectId: v.id("projects"),
    jobId: v.optional(v.id("jobs")),
    kind: usageKind,
    quality: v.optional(jobQuality),
    model: v.string(),
    byok: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project === null) return null;
    await ctx.db.insert("usageEvents", {
      userId: project.userId,
      projectId: args.projectId,
      jobId: args.jobId,
      kind: args.kind,
      quality: args.kind === "image" ? args.quality : undefined,
      model: args.model,
      estimatedCostUsd: estimateCost(args.kind, args.model, args.quality),
      byok: args.byok,
      month: monthKey(),
    });
    return null;
  },
});

/** The signed-in user's allowance for the sidebar meter. */
export const myUsage = query({
  args: {},
  returns: v.union(v.null(), summaryShape),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null) return null;
    return await usageSummary(ctx, user);
  },
});

/** Months with any recorded usage (plus the current one), newest first. */
export const months = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    if ((await currentAdmin(ctx)) === null) return [];
    const found = new Set<string>([monthKey()]);
    // Walk the by_month index one distinct month at a time instead of
    // scanning every event.
    let cursor: string | null = null;
    for (let i = 0; i < 240; i++) {
      const upper: string | null = cursor;
      const next: Doc<"usageEvents"> | null = await ctx.db
        .query("usageEvents")
        .withIndex("by_month", (q) =>
          upper === null ? q : q.lt("month", upper),
        )
        .order("desc")
        .first();
      if (next === null) break;
      found.add(next.month);
      cursor = next.month;
    }
    return [...found].sort((a, b) => b.localeCompare(a));
  },
});

const overviewRow = v.object({
  userId: v.id("users"),
  email: v.string(),
  planName: v.union(v.string(), v.null()),
  images: v.number(),
  byokImages: v.number(),
  researchRuns: v.number(),
  copyRuns: v.number(),
  estimatedCostUsd: v.number(),
  quota: v.union(v.number(), v.null()),
});

const overviewTotals = v.object({
  images: v.number(),
  estimatedCostUsd: v.number(),
  researchRuns: v.number(),
  copyRuns: v.number(),
});

type OverviewRow = {
  userId: Id<"users">;
  email: string;
  planName: string | null;
  images: number;
  byokImages: number;
  researchRuns: number;
  copyRuns: number;
  estimatedCostUsd: number;
  quota: number | null;
};

/**
 * Per-user usage for one month. Estimated spend only counts calls billed
 * to our keys; calls on a customer's own keys are counted but cost us
 * nothing.
 */
export const adminOverview = query({
  args: { month: v.string() },
  returns: v.object({ rows: v.array(overviewRow), totals: overviewTotals }),
  handler: async (ctx, args) => {
    const totals = {
      images: 0,
      estimatedCostUsd: 0,
      researchRuns: 0,
      copyRuns: 0,
    };
    if ((await currentAdmin(ctx)) === null) return { rows: [], totals };

    const events = await ctx.db
      .query("usageEvents")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .collect();

    const byUser = new Map<Id<"users">, OverviewRow>();
    for (const event of events) {
      let row = byUser.get(event.userId);
      if (row === undefined) {
        row = {
          userId: event.userId,
          email: "",
          planName: null,
          images: 0,
          byokImages: 0,
          researchRuns: 0,
          copyRuns: 0,
          estimatedCostUsd: 0,
          quota: null,
        };
        byUser.set(event.userId, row);
      }
      if (event.kind === "image") {
        row.images++;
        if (event.byok) row.byokImages++;
      } else if (event.kind === "research") {
        row.researchRuns++;
      } else {
        row.copyRuns++;
      }
      if (!event.byok) row.estimatedCostUsd += event.estimatedCostUsd;
    }

    const plans = new Map<Id<"plans">, Doc<"plans"> | null>();
    const rows: OverviewRow[] = [];
    for (const row of byUser.values()) {
      const user = await ctx.db.get(row.userId);
      let plan: Doc<"plans"> | null = null;
      if (user?.planId) {
        if (!plans.has(user.planId)) {
          plans.set(user.planId, await ctx.db.get(user.planId));
        }
        plan = plans.get(user.planId) ?? null;
      }
      const ownFalKey =
        user !== null &&
        (await ctx.db
          .query("apiKeys")
          .withIndex("by_user_provider", (q) =>
            q.eq("userId", user._id).eq("provider", "fal"),
          )
          .first()) !== null;
      row.email = user?.email ?? user?.name ?? "Deleted account";
      row.planName = plan?.name ?? null;
      row.quota = ownFalKey ? null : (plan?.monthlyImageQuota ?? null);
      row.estimatedCostUsd = Math.round(row.estimatedCostUsd * 100) / 100;
      rows.push(row);

      totals.images += row.images;
      totals.estimatedCostUsd += row.estimatedCostUsd;
      totals.researchRuns += row.researchRuns;
      totals.copyRuns += row.copyRuns;
    }
    totals.estimatedCostUsd = Math.round(totals.estimatedCostUsd * 100) / 100;

    rows.sort(
      (a, b) =>
        b.estimatedCostUsd - a.estimatedCostUsd ||
        b.images - a.images ||
        a.email.localeCompare(b.email),
    );
    return { rows, totals };
  },
});
