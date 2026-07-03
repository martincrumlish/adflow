import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { currentUser, isAdminUser, requireUser } from "./lib/access";
import { aspectRatio } from "./schema";

const templateDoc = v.object({
  _id: v.id("templates"),
  _creationTime: v.number(),
  number: v.number(),
  name: v.string(),
  body: v.string(),
  aspectRatio,
  needsProductImages: v.boolean(),
  category: v.optional(v.string()),
  userId: v.optional(v.id("users")),
  isSystem: v.boolean(),
});

/** System templates + the signed-in user's custom templates. */
export const list = query({
  args: {},
  returns: v.array(templateDoc),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null) return [];
    const system = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", undefined))
      .collect();
    const custom = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return [...system, ...custom]
      .sort((a, b) => a.number - b.number)
      .map((t) => ({ ...t, isSystem: t.userId === undefined }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    body: v.string(),
    aspectRatio,
    needsProductImages: v.boolean(),
    category: v.optional(v.string()),
  },
  returns: v.id("templates"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    const body = args.body.trim();
    if (!name || !body) {
      throw new ConvexError("Template name and body are required.");
    }
    const all = await ctx.db.query("templates").collect();
    const nextNumber = Math.max(0, ...all.map((t) => t.number)) + 1;
    return await ctx.db.insert("templates", {
      number: nextNumber,
      name,
      body,
      aspectRatio: args.aspectRatio,
      needsProductImages: args.needsProductImages,
      category: args.category?.trim() || undefined,
      userId: user._id,
    });
  },
});

export const update = mutation({
  args: {
    templateId: v.id("templates"),
    name: v.optional(v.string()),
    body: v.optional(v.string()),
    aspectRatio: v.optional(aspectRatio),
    needsProductImages: v.optional(v.boolean()),
    category: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new ConvexError("Template not found");
    const canEdit =
      template.userId === user._id ||
      (template.userId === undefined && isAdminUser(user));
    if (!canEdit) {
      throw new ConvexError(
        "System templates can't be edited. Duplicate it to make your own version.",
      );
    }
    await ctx.db.patch(args.templateId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.body !== undefined ? { body: args.body.trim() } : {}),
      ...(args.aspectRatio !== undefined
        ? { aspectRatio: args.aspectRatio }
        : {}),
      ...(args.needsProductImages !== undefined
        ? { needsProductImages: args.needsProductImages }
        : {}),
      ...(args.category !== undefined
        ? { category: args.category.trim() || undefined }
        : {}),
    });
    return null;
  },
});

export const duplicate = mutation({
  args: { templateId: v.id("templates") },
  returns: v.id("templates"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const template = await ctx.db.get(args.templateId);
    if (
      !template ||
      (template.userId !== undefined && template.userId !== user._id)
    ) {
      throw new ConvexError("Template not found");
    }
    const all = await ctx.db.query("templates").collect();
    const nextNumber = Math.max(0, ...all.map((t) => t.number)) + 1;
    return await ctx.db.insert("templates", {
      number: nextNumber,
      name: `${template.name}-copy`,
      body: template.body,
      aspectRatio: template.aspectRatio,
      needsProductImages: template.needsProductImages,
      category: template.category,
      userId: user._id,
    });
  },
});

export const remove = mutation({
  args: { templateId: v.id("templates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new ConvexError("Template not found");
    const canDelete =
      template.userId === user._id ||
      (template.userId === undefined && isAdminUser(user));
    if (!canDelete) throw new ConvexError("You can't delete this template.");
    await ctx.db.delete(args.templateId);
    return null;
  },
});

/** Idempotent: seeds the PRD §10 system library once. */
export const seed = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", undefined))
      .take(1);
    if (existing.length > 0) return 0;
    for (const template of SEED_TEMPLATES) {
      await ctx.db.insert("templates", template);
    }
    return SEED_TEMPLATES.length;
  },
});

const SEED_TEMPLATES: Array<{
  number: number;
  name: string;
  body: string;
  aspectRatio: "1:1" | "4:5" | "9:16";
  needsProductImages: boolean;
  category: string;
}> = [
  {
    number: 1,
    name: "headline",
    aspectRatio: "4:5",
    needsProductImages: true,
    category: "product",
    body: `Studio product ad. [PRODUCT] centered on a [BACKGROUND COLOR] seamless backdrop, soft directional key light, subtle shadow. Large bold headline across the top reading "[HEADLINE COPY]" in [FONT STYLE]. Smaller subhead beneath reading "[SUBHEAD COPY]". Brand logo top-left. Clean, high-contrast, premium. Text appears once, exactly as written.`,
  },
  {
    number: 2,
    name: "offer-promotion",
    aspectRatio: "1:1",
    needsProductImages: true,
    category: "conversion",
    body: `Promotional ad card. [PRODUCT] on a [BACKGROUND COLOR] background with a bold offer badge reading "[OFFER e.g. 40% OFF TODAY]" in [ACCENT COLOR]. Headline "[OFFER HEADLINE]". A pill CTA button reading "[CTA e.g. Shop Now]" in the brand CTA color. Energetic, conversion-focused layout. All text rendered once, verbatim.`,
  },
  {
    number: 3,
    name: "us-vs-them",
    aspectRatio: "4:5",
    needsProductImages: false,
    category: "comparison",
    body: `Comparison ad, two vertical columns on a [BACKGROUND COLOR] background. Left column header "[BRAND]" in [ACCENT COLOR] with green check rows: "[BENEFIT 1]", "[BENEFIT 2]", "[BENEFIT 3]". Right column header "Others" greyed out with red X rows: "[NEGATIVE 1]", "[NEGATIVE 2]", "[NEGATIVE 3]". Clean sans-serif, clear visual winner on the left. Text exact and legible.`,
  },
  {
    number: 4,
    name: "testimonial-card",
    aspectRatio: "1:1",
    needsProductImages: false,
    category: "social-proof",
    body: `Testimonial graphic on a [BACKGROUND COLOR] card. Five gold stars at top. Large quote reading "[CUSTOMER QUOTE]" in a readable serif. Attribution line "[CUSTOMER NAME], [DESCRIPTOR]" below with a small circular avatar. Minimal, trustworthy, lots of whitespace. Render text once, exactly as written.`,
  },
  {
    number: 5,
    name: "review-screenshot",
    aspectRatio: "4:5",
    needsProductImages: false,
    category: "social-proof",
    body: `Realistic product-review card UI. White card, five filled orange stars, bold review title "[REVIEW TITLE]", body text "[REVIEW BODY]", a "Verified Purchase" badge, reviewer name "[NAME]" and a date. Looks like a genuine e-commerce review. Crisp UI typography, pixel-clean text rendered verbatim.`,
  },
  {
    number: 6,
    name: "stat-callout",
    aspectRatio: "1:1",
    needsProductImages: true,
    category: "product",
    body: `Bold statistic ad. [PRODUCT] to one side on a [BACKGROUND COLOR] background. A very large number "[STAT e.g. 92%]" in [ACCENT COLOR] with a supporting line "[STAT DESCRIPTION]" beneath. Radiating accent lines or a simple ring around the number. Confident, punchy. Numbers and text render once, exactly.`,
  },
  {
    number: 7,
    name: "ugc-selfie",
    aspectRatio: "9:16",
    needsProductImages: true,
    category: "ugc",
    body: `Authentic UGC-style vertical phone photo. A real-looking [PERSONA] holding [PRODUCT] in a [SETTING], natural window light, slightly imperfect framing, shot on phone. Casual, relatable, not studio-polished. A small caption bar at the bottom reading "[UGC CAPTION]". Caption text legible and rendered once.`,
  },
  {
    number: 8,
    name: "before-after",
    aspectRatio: "1:1",
    needsProductImages: true,
    category: "comparison",
    body: `Split before/after ad on a [BACKGROUND COLOR] background. Left half labeled "Before" showing "[BEFORE STATE]"; right half labeled "After" showing "[AFTER STATE]" with [PRODUCT] visible. Clear dividing line, arrow between halves. Honest, clean, benefit-obvious. Labels rendered once, exactly.`,
  },
  {
    number: 9,
    name: "press-editorial",
    aspectRatio: "4:5",
    needsProductImages: true,
    category: "editorial",
    body: `Premium magazine editorial layout featuring [PRODUCT]. Elegant serif masthead "[PUBLICATION-STYLE HEADER]", a pull-quote "[EDITORIAL QUOTE]", refined product photography with soft daylight, generous margins, muted [BACKGROUND COLOR] palette. Feels like a real press feature, not an ad. All text rendered once, verbatim.`,
  },
  {
    number: 10,
    name: "faux-iphone-notes",
    aspectRatio: "9:16",
    needsProductImages: false,
    category: "ugc",
    body: `A realistic iPhone Notes app screenshot, vertical. Title line "[NOTE TITLE]" then a short handwritten-feeling list: "[LINE 1]", "[LINE 2]", "[LINE 3]", "[LINE 4]". Authentic iOS Notes UI (top bar, off-white background, system font). Text crisp and rendered exactly as written, once.`,
  },
  {
    number: 11,
    name: "feature-callout",
    aspectRatio: "4:5",
    needsProductImages: true,
    category: "product",
    body: `[PRODUCT] shown large and centered on a [BACKGROUND COLOR] background, with 3-4 thin annotation lines pointing to features, each labeled "[FEATURE 1]", "[FEATURE 2]", "[FEATURE 3]". Clean technical-but-premium look, brand accent color for the callout lines. Labels legible, rendered once.`,
  },
  {
    number: 12,
    name: "manifesto",
    aspectRatio: "1:1",
    needsProductImages: false,
    category: "brand",
    body: `Bold typographic manifesto ad. No product. Full-bleed [BACKGROUND COLOR] background with a large statement set in [FONT STYLE]: "[MANIFESTO LINE 1] / [MANIFESTO LINE 2] / [MANIFESTO LINE 3]". Key words emphasized in [ACCENT COLOR]. Confident, brand-voice-driven, striking. Text rendered once, exactly as written.`,
  },
];
