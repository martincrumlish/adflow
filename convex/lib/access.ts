import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user: Doc<"users">): boolean {
  if (user.role === "admin") return true;
  return (
    user.email !== undefined && adminEmails().includes(user.email.toLowerCase())
  );
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError("Not signed in");
  const user = await ctx.db.get(userId);
  if (user === null) throw new ConvexError("User not found");
  return user;
}

/**
 * Nullable variants for queries: a signed-out client may still hold
 * live subscriptions for a moment, so reads degrade to empty results
 * instead of throwing. Mutations/actions keep the throwing variants.
 */
export async function currentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
}

export async function currentAdmin(ctx: Ctx): Promise<Doc<"users"> | null> {
  const user = await currentUser(ctx);
  return user !== null && isAdminUser(user) ? user : null;
}

export async function ownedProject(
  ctx: Ctx,
  projectId: Id<"projects">,
): Promise<{ user: Doc<"users">; project: Doc<"projects"> } | null> {
  const user = await currentUser(ctx);
  if (user === null) return null;
  const project = await ctx.db.get(projectId);
  if (project === null || project.userId !== user._id) return null;
  return { user, project };
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Admin access required");
  return user;
}

export async function requireProject(
  ctx: Ctx,
  projectId: Id<"projects">,
): Promise<{ user: Doc<"users">; project: Doc<"projects"> }> {
  const user = await requireUser(ctx);
  const project = await ctx.db.get(projectId);
  if (project === null || project.userId !== user._id) {
    throw new ConvexError("Project not found");
  }
  return { user, project };
}
