import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { monthKey, nextMonthStart } from "./costs";

type Ctx = QueryCtx | MutationCtx;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "1 October", in UTC, for the reset date in user-facing messages. */
function formatResetDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}

export type UsageSummary = {
  /** Metered images this month, including renders still in flight. */
  used: number;
  /** Monthly allowance; null when unlimited or exempt. */
  quota: number | null;
  /** True when no limit applies (own FAL key, no plan, or no quota). */
  exempt: boolean;
  /** True when renders bill the user's own FAL key. */
  ownKeys: boolean;
  /** "YYYY-MM" (UTC) the numbers refer to. */
  month: string;
  /** When the allowance resets (start of next UTC month), in ms. */
  resetsOn: number;
};

async function hasOwnFalKey(ctx: Ctx, userId: Id<"users">) {
  const row = await ctx.db
    .query("apiKeys")
    .withIndex("by_user_provider", (q) =>
      q.eq("userId", userId).eq("provider", "fal"),
    )
    .first();
  return row !== null;
}

/** Finished images billed to us (not the user's own key) this month. */
async function meteredImagesThisMonth(
  ctx: Ctx,
  userId: Id<"users">,
  month: string,
) {
  const events = await ctx.db
    .query("usageEvents")
    .withIndex("by_user_month", (q) =>
      q.eq("userId", userId).eq("month", month),
    )
    .collect();
  return events.filter((e) => e.kind === "image" && !e.byok).length;
}

/**
 * Queued + running jobs across all of the user's projects. They are not
 * in usageEvents yet, so counting them stops a burst of runs from
 * overshooting the allowance.
 */
async function inFlightJobs(ctx: Ctx, userId: Id<"users">) {
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  let count = 0;
  for (const project of projects) {
    for (const status of ["queued", "running"] as const) {
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", project._id).eq("status", status),
        )
        .collect();
      count += jobs.length;
    }
  }
  return count;
}

export async function usageSummary(
  ctx: Ctx,
  user: Doc<"users">,
): Promise<UsageSummary> {
  const now = new Date();
  const month = monthKey(now);
  const resetsOn = nextMonthStart(now);
  const ownKeys = await hasOwnFalKey(ctx, user._id);
  const plan = user.planId ? await ctx.db.get(user.planId) : null;
  const quota = ownKeys ? null : (plan?.monthlyImageQuota ?? null);
  const finished = await meteredImagesThisMonth(ctx, user._id, month);
  // In-flight renders only count against us when we pay for them.
  const pending = ownKeys ? 0 : await inFlightJobs(ctx, user._id);
  return {
    used: finished + pending,
    quota,
    exempt: quota === null,
    ownKeys,
    month,
    resetsOn,
  };
}

/**
 * Throws a user-facing ConvexError when rendering `newImages` more
 * images would take the user past their plan's monthly allowance.
 * Users on their own FAL key, without a plan, or on a plan with no
 * limit are never metered.
 */
export async function assertWithinQuota(
  ctx: MutationCtx,
  userId: Id<"users">,
  newImages: number,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (user === null) return;
  const summary = await usageSummary(ctx, user);
  if (summary.quota === null) return;
  const { used, quota } = summary;
  if (used + newImages <= quota) return;
  const resets = formatResetDate(summary.resetsOn);
  const remaining = Math.max(0, quota - used);
  if (remaining === 0) {
    throw new ConvexError(
      `Monthly limit reached: ${Math.min(used, quota)} of ${quota} images used this month. Your allowance resets on ${resets}.`,
    );
  }
  throw new ConvexError(
    `This would render ${newImages} images, but only ${remaining} of your ${quota} are left this month. Pick fewer ads or variations, or wait until ${resets} when your allowance resets.`,
  );
}
