import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { currentAdmin, requireAdmin } from "./lib/access";

export const DEFAULT_TEXT_MODEL = "anthropic/claude-sonnet-5";
export const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2";

const settingsShape = v.object({
  textModel: v.string(),
  imageModel: v.string(),
});

async function loadSettings(ctx: QueryCtx) {
  const doc = await ctx.db.query("appSettings").first();
  return {
    textModel:
      doc?.textModel ?? process.env.OPENROUTER_MODEL ?? DEFAULT_TEXT_MODEL,
    imageModel: doc?.imageModel ?? DEFAULT_IMAGE_MODEL,
  };
}

/** Effective settings for the AI pipeline (defaults applied). */
export const getForRun = internalQuery({
  args: {},
  returns: settingsShape,
  handler: async (ctx) => loadSettings(ctx),
});

export const adminGet = query({
  args: {},
  returns: v.union(settingsShape, v.null()),
  handler: async (ctx) => {
    if ((await currentAdmin(ctx)) === null) return null;
    return await loadSettings(ctx);
  },
});

export const adminUpdate = mutation({
  args: {
    textModel: v.string(),
    imageModel: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const patch = {
      textModel: args.textModel.trim() || undefined,
      imageModel: args.imageModel.trim() || undefined,
    };
    const doc = await ctx.db.query("appSettings").first();
    if (doc) await ctx.db.patch(doc._id, patch);
    else await ctx.db.insert("appSettings", patch);
    return null;
  },
});

/**
 * Tool-capable text models from the OpenRouter catalog (brand research
 * uses the web-search tool, so models without tool support are hidden).
 */
export const listTextModels = action({
  args: {},
  returns: v.array(v.object({ id: v.string(), name: v.string() })),
  handler: async (ctx) => {
    await ctx.runQuery(internal.users.assertAdmin, {});
    const response = await fetch("https://openrouter.ai/api/v1/models");
    if (!response.ok) {
      throw new Error(`Could not load the model list (${response.status}).`);
    }
    const payload = (await response.json()) as {
      data: Array<{
        id: string;
        name?: string;
        architecture?: { output_modalities?: string[] };
        supported_parameters?: string[];
      }>;
    };
    return payload.data
      .filter(
        (model) =>
          (model.supported_parameters?.includes("tools") ?? false) &&
          (model.architecture?.output_modalities?.includes("text") ?? true),
      )
      .map((model) => ({ id: model.id, name: model.name ?? model.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  },
});

/**
 * Popular text-to-image endpoints from the FAL catalog (first pages of
 * FAL's popularity-ordered listing), with a flag for whether an /edit
 * variant exists — needed for product/style reference images.
 */
export const listImageModels = action({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      hasEdit: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await ctx.runQuery(internal.users.assertAdmin, {});
    const items: Array<{ id: string; title?: string; category?: string }> = [];
    for (let page = 1; page <= 3; page++) {
      const response = await fetch(
        `https://fal.ai/api/models?category=text-to-image&page=${page}`,
      );
      if (!response.ok) break;
      const payload = (await response.json()) as {
        items: Array<{ id: string; title?: string; category?: string }>;
      };
      items.push(...payload.items);
      if (payload.items.length === 0) break;
    }
    const ids = new Set(items.map((item) => item.id));
    const seen = new Set<string>();
    const models: Array<{ id: string; name: string; hasEdit: boolean }> = [];
    for (const item of items) {
      if (item.category !== "text-to-image") continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      models.push({
        id: item.id,
        name: item.title ?? item.id,
        hasEdit:
          ids.has(`${item.id}/edit`) || item.id.startsWith("openai/gpt-image"),
      });
    }
    return models;
  },
});
