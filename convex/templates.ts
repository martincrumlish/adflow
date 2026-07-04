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
  exampleImageId: v.optional(v.id("_storage")),
  exampleFalUrl: v.optional(v.string()),
  isSystem: v.boolean(),
  exampleImageUrl: v.union(v.string(), v.null()),
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
    return await Promise.all(
      [...system, ...custom]
        .sort((a, b) => a.number - b.number)
        .map(async (t) => ({
          ...t,
          isSystem: t.userId === undefined,
          exampleImageUrl: t.exampleImageId
            ? await ctx.storage.getUrl(t.exampleImageId)
            : null,
        })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    body: v.string(),
    aspectRatio,
    needsProductImages: v.boolean(),
    category: v.optional(v.string()),
    exampleImageId: v.optional(v.id("_storage")),
    // Admins may add to the shared system library (e.g. when curating
    // formats discovered outside the app).
    system: v.optional(v.boolean()),
  },
  returns: v.id("templates"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.system && !isAdminUser(user)) {
      throw new ConvexError("Only admins can add system templates.");
    }
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
      userId: args.system ? undefined : user._id,
      exampleImageId: args.exampleImageId,
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
    // Set to replace, null to remove, omit to leave untouched.
    exampleImageId: v.optional(v.union(v.id("_storage"), v.null())),
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
    if (
      args.exampleImageId !== undefined &&
      template.exampleImageId &&
      template.exampleImageId !== args.exampleImageId
    ) {
      await ctx.storage.delete(template.exampleImageId);
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
      ...(args.exampleImageId !== undefined
        ? {
            exampleImageId: args.exampleImageId ?? undefined,
            exampleFalUrl: undefined,
          }
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
    // The style example is intentionally not copied: storage files are
    // deleted with their owning template, so sharing one would dangle.
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
    if (template.exampleImageId) {
      await ctx.storage.delete(template.exampleImageId);
    }
    await ctx.db.delete(args.templateId);
    return null;
  },
});

/** Cache the FAL URL so each style example uploads to FAL once. */
export const setExampleFalUrl = internalMutation({
  args: { templateId: v.id("templates"), falUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (template) {
      await ctx.db.patch(args.templateId, { exampleFalUrl: args.falUrl });
    }
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

/**
 * Idempotent (by name): formats distilled from long-running creatives
 * found in the Meta Ad Library (AG1, Magic Spoon, True Classic),
 * July 2026 curation pass.
 */
export const seedDiscoveredJul2026 = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const system = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", undefined))
      .collect();
    const existingNames = new Set(system.map((t) => t.name));
    const all = await ctx.db.query("templates").collect();
    let nextNumber = Math.max(0, ...all.map((t) => t.number)) + 1;
    let added = 0;
    for (const template of DISCOVERED_JUL_2026) {
      if (existingNames.has(template.name)) continue;
      await ctx.db.insert("templates", { ...template, number: nextNumber++ });
      added++;
    }
    return added;
  },
});

const DISCOVERED_JUL_2026: Array<{
  name: string;
  body: string;
  aspectRatio: "1:1" | "4:5" | "9:16";
  needsProductImages: boolean;
  category: string;
}> = [
  {
    name: "text-post-confession",
    aspectRatio: "1:1",
    needsProductImages: false,
    category: "ugc",
    body: `Casual social text-post ad. A long, funny first-person confession set as rounded [TEXT COLOR] text on a vibrant [GRADIENT OR BOLD BACKGROUND], reading: "[CONFESSION COPY - 40-60 words of oversharing enthusiasm about the product, ending casually, e.g. it's on sale now, hopefully we don't sell out]". Looks like a screenshotted social text post: sincere, slightly unhinged, human. No product image. Text rendered once, exactly as written.`,
  },
  {
    name: "spec-strip-banner",
    aspectRatio: "4:5",
    needsProductImages: true,
    category: "product",
    body: `Product banner ad. A bold title bar across the top reading "[PRODUCT CATEGORY e.g. PROTEIN OATS]" in [ACCENT COLOR], above a horizontal stat strip of three columns: "[STAT 1 e.g. 15g PROTEIN]", "[STAT 2 e.g. 6g FIBER]", "[STAT 3 e.g. 1g SUGAR]". Below, the [PRODUCT] lineup arranged on a [BACKGROUND COLOR] gradient surface with soft studio light. Punchy, information-dense, retail-ready. All numbers and text rendered once, exactly as written.`,
  },
  {
    name: "benefit-checklist",
    aspectRatio: "4:5",
    needsProductImages: true,
    category: "conversion",
    body: `Checklist ad. Bold headline at top reading "[HEADLINE e.g. STOP THE SEARCH!]" with a short subhead "[SUBHEAD]". Below, three rows each led by a green checkmark: "[BENEFIT 1]", "[BENEFIT 2]", "[BENEFIT 3]". [PRODUCT] shown beneath as a clean flat-lay on a [BACKGROUND COLOR] backdrop. Confident, decision-closing layout. Text exact and legible, rendered once.`,
  },
  {
    name: "variant-grid",
    aspectRatio: "1:1",
    needsProductImages: true,
    category: "product",
    body: `Product variant grid ad. Headline reading "[HEADLINE e.g. Three flavors. One daily habit.]" above a grid of [NUMBER] tiles, each tile showing a different [PRODUCT] variant on its own [COLOR] color-blocked background with a small label "[VARIANT NAME]". Clean, modern, packaging-forward layout on a [BACKGROUND COLOR] base. Labels legible, rendered once, exactly as written.`,
  },
  {
    name: "sticker-lifestyle",
    aspectRatio: "9:16",
    needsProductImages: true,
    category: "ugc",
    body: `Casual lifestyle photo ad with a shot-on-phone feel. [PRODUCT] in a real [SETTING e.g. kitchen counter], natural light, imperfect framing. An arched header at the top reading "[HEADER COPY]" in a friendly rounded font, plus 2-3 rounded sticker badges near the product reading "[STICKER 1]", "[STICKER 2]", "[STICKER 3]" in [ACCENT COLOR]. Playful, personal, unpolished-on-purpose. All text rendered once, exactly.`,
  },
  {
    name: "offer-stack",
    aspectRatio: "1:1",
    needsProductImages: true,
    category: "conversion",
    body: `Bundle offer flat-lay ad. [PRODUCT] centered with its included freebies arranged around it, each labeled via a thin callout line: "[ITEM 1 e.g. FREE Shaker]", "[ITEM 2]", "[ITEM 3]". Headline at top reading "[OFFER HEADLINE e.g. Get Your $79 Welcome Kit FREE]" in [ACCENT COLOR] with a small subhead "[SUBHEAD]". Premium e-commerce offer presentation on a [BACKGROUND COLOR] backdrop. Text appears once, exactly as written.`,
  },
];

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
