import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { ownedProject, requireProject, requireUser } from "./lib/access";
import { MAX_PRODUCT_IMAGES } from "./productImages";
import { projectStatus } from "./schema";

/**
 * Project duplication: start a new campaign from an existing project's
 * Brand DNA without paying for research again.
 *
 * Stored files are copied, never shared. deleteProjectContents deletes
 * blobs by storage id, so two projects pointing at one blob would lose
 * the file when either is deleted. Only actions can read and write
 * storage, which is why the entry point is an action. FAL cache URLs are
 * immutable and safe to share, so they are copied as-is and the new
 * project never re-uploads to FAL.
 */

// A project mid-run is in flux (Brand DNA being rewritten, prompts or
// images being produced), so duplication waits for it to settle.
const BUSY_MESSAGES: Partial<Record<Doc<"projects">["status"], string>> = {
  researching: "Wait for brand research to finish before duplicating.",
  prompting: "Wait for the ads to finish preparing before duplicating.",
  generating: "Wait for generation to finish before duplicating.",
};

function assertNotBusy(status: Doc<"projects">["status"]) {
  const message = BUSY_MESSAGES[status];
  if (message) throw new ConvexError(message);
}

async function brandDnaFor(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"projects">,
) {
  return await ctx.db
    .query("brandDna")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .unique();
}

/** What a duplicate of this project would carry over, for the dialog. */
export const summary = query({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.null(),
    v.object({
      hasBrandDna: v.boolean(),
      productImageCount: v.number(),
      hasLogo: v.boolean(),
      formatCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const owned = await ownedProject(ctx, args.projectId);
    if (owned === null) return null;
    const { project } = owned;
    const images = await ctx.db
      .query("productImages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return {
      hasBrandDna: (await brandDnaFor(ctx, args.projectId)) !== null,
      productImageCount: images.length,
      hasLogo: project.logoImageId !== undefined,
      formatCount: project.selectedTemplateIds?.length ?? 0,
    };
  },
});

const fileToCopy = v.object({
  storageId: v.id("_storage"),
  filename: v.string(),
  falUrl: v.optional(v.string()),
});

/** Owner-checked snapshot of the source project, read from the action. */
export const snapshot = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    name: v.string(),
    productName: v.string(),
    status: projectStatus,
    hasBrandDna: v.boolean(),
    productImages: v.array(fileToCopy),
    logoImageId: v.optional(v.id("_storage")),
    logoFalUrl: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.projectId);
    const images = await ctx.db
      .query("productImages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return {
      name: project.name,
      productName: project.productName,
      status: project.status,
      hasBrandDna: (await brandDnaFor(ctx, args.projectId)) !== null,
      productImages: images.map((image) => ({
        storageId: image.storageId,
        filename: image.filename,
        falUrl: image.falUrl,
      })),
      logoImageId: project.logoImageId,
      logoFalUrl: project.logoFalUrl,
    };
  },
});

/**
 * Inserts the new project and its Brand DNA copy in one transaction.
 * The Brand DNA is read here rather than passed in from the snapshot so
 * the copy is exactly what the source holds at commit time.
 */
export const createCopy = internalMutation({
  args: {
    sourceProjectId: v.id("projects"),
    name: v.string(),
    productName: v.string(),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const source = await ctx.db.get(args.sourceProjectId);
    if (source === null || source.userId !== user._id) {
      throw new ConvexError("Project not found");
    }
    assertNotBusy(source.status);

    const dna = await brandDnaFor(ctx, args.sourceProjectId);
    const projectId = await ctx.db.insert("projects", {
      userId: user._id,
      name: args.name.trim() || `${source.name} copy`,
      brandName: source.brandName,
      brandUrl: source.brandUrl,
      productName: args.productName.trim() || source.productName,
      status: dna ? "research_ready" : "setup",
      selectedTemplateIds: source.selectedTemplateIds,
      sourceProjectId: source._id,
    });
    if (dna) {
      await ctx.db.insert("brandDna", {
        projectId,
        document: dna.document,
        promptModifier: dna.promptModifier,
      });
    }
    return projectId;
  },
});

/**
 * Attaches a freshly copied blob to the new project. If the project is
 * gone or the slot is already taken (the user deleted the copy, or
 * uploaded their own file, while the copy ran), the blob is deleted so
 * nothing is orphaned in storage.
 */
export const attachCopiedFile = internalMutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    file: v.union(
      v.object({
        kind: v.literal("productImage"),
        filename: v.string(),
        falUrl: v.optional(v.string()),
      }),
      v.object({
        kind: v.literal("logo"),
        falUrl: v.optional(v.string()),
      }),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const owned = await ownedProject(ctx, args.projectId);
    if (owned === null) {
      await ctx.storage.delete(args.storageId);
      return false;
    }

    if (args.file.kind === "logo") {
      if (owned.project.logoImageId !== undefined) {
        await ctx.storage.delete(args.storageId);
        return false;
      }
      await ctx.db.patch(args.projectId, {
        logoImageId: args.storageId,
        logoFalUrl: args.file.falUrl,
      });
      return true;
    }

    const existing = await ctx.db
      .query("productImages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (existing.length >= MAX_PRODUCT_IMAGES) {
      await ctx.storage.delete(args.storageId);
      return false;
    }
    await ctx.db.insert("productImages", {
      projectId: args.projectId,
      storageId: args.storageId,
      filename: args.file.filename,
      falUrl: args.file.falUrl,
    });
    return true;
  },
});

export const duplicate = action({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    productName: v.string(),
  },
  returns: v.object({
    projectId: v.id("projects"),
    // Whether the copy starts at research_ready (Brand DNA) or setup.
    hasBrandDna: v.boolean(),
    // Files that could not be copied (missing or failed); the user can
    // re-upload them on the new project's setup page.
    skippedFiles: v.number(),
  }),
  handler: async (ctx, args): Promise<{
    projectId: Id<"projects">;
    hasBrandDna: boolean;
    skippedFiles: number;
  }> => {
    const source = await ctx.runQuery(internal.projectDuplicate.snapshot, {
      projectId: args.projectId,
    });
    // Fail fast; createCopy re-checks inside its transaction.
    assertNotBusy(source.status);

    const projectId: Id<"projects"> = await ctx.runMutation(
      internal.projectDuplicate.createCopy,
      {
        sourceProjectId: args.projectId,
        name: args.name,
        productName: args.productName,
      },
    );

    // Files are copied only after the project row exists, so a failure
    // part-way leaves a usable project (Brand DNA and formats intact)
    // that is merely missing some photos, never a half-built row. Each
    // copy is independent: one bad blob does not stop the others.
    type Copy = {
      storageId: Id<"_storage">;
      file:
        | { kind: "productImage"; filename: string; falUrl?: string }
        | { kind: "logo"; falUrl?: string };
    };
    const copies: Copy[] = source.productImages.map((image) => ({
      storageId: image.storageId,
      file: {
        kind: "productImage",
        filename: image.filename,
        falUrl: image.falUrl,
      },
    }));
    if (source.logoImageId !== undefined) {
      copies.push({
        storageId: source.logoImageId,
        file: { kind: "logo", falUrl: source.logoFalUrl },
      });
    }

    const results = await Promise.all(
      copies.map(async ({ storageId, file }) => {
        try {
          const blob = await ctx.storage.get(storageId);
          if (blob === null) return false;
          const copyId = await ctx.storage.store(blob);
          return await ctx.runMutation(
            internal.projectDuplicate.attachCopiedFile,
            { projectId, storageId: copyId, file },
          );
        } catch (error) {
          console.error("Could not copy file while duplicating", error);
          return false;
        }
      }),
    );

    return {
      projectId,
      hasBrandDna: source.hasBrandDna,
      skippedFiles: results.filter((copied) => !copied).length,
    };
  },
});
