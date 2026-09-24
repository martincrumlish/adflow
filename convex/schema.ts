import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const aspectRatio = v.union(
  v.literal("1:1"),
  v.literal("4:5"),
  v.literal("9:16"),
);

export const jobQuality = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

export const projectStatus = v.union(
  v.literal("setup"),
  v.literal("researching"),
  v.literal("research_ready"),
  v.literal("prompting"),
  v.literal("prompts_ready"),
  v.literal("generating"),
  v.literal("done"),
);

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("admin"), v.literal("user"))),
    planId: v.optional(v.id("plans")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  plans: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    // Finished images allowed per calendar month; undefined = unlimited.
    // Users with their own API keys (apiKeys rows) are never metered.
    monthlyImageQuota: v.optional(v.number()),
  }),

  // One row per billable AI call (image render, research, copywriting)
  // so admins can see spend and quotas can be enforced per month.
  usageEvents: defineTable({
    userId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    jobId: v.optional(v.id("jobs")),
    kind: v.union(
      v.literal("image"),
      v.literal("research"),
      v.literal("copy"),
    ),
    quality: v.optional(jobQuality),
    model: v.string(),
    estimatedCostUsd: v.number(),
    // True when the call was billed to the user's own key (unmetered).
    byok: v.boolean(),
    // "YYYY-MM" in UTC, the quota window.
    month: v.string(),
  })
    .index("by_user_month", ["userId", "month"])
    .index("by_month", ["month"])
    .index("by_project", ["projectId"]),

  // Client-review links: a public, tokenised read-only view of a
  // project's gallery, with per-image approval feedback.
  shares: defineTable({
    projectId: v.id("projects"),
    token: v.string(),
    label: v.optional(v.string()),
    active: v.boolean(),
    allowDownload: v.boolean(),
  })
    .index("by_token", ["token"])
    .index("by_project", ["projectId"]),

  shareFeedback: defineTable({
    shareId: v.id("shares"),
    imageId: v.id("images"),
    verdict: v.optional(
      v.union(v.literal("approved"), v.literal("changes")),
    ),
    comment: v.optional(v.string()),
    reviewerName: v.optional(v.string()),
  })
    .index("by_share", ["shareId"])
    .index("by_share_image", ["shareId", "imageId"])
    .index("by_image", ["imageId"]),

  // Bring-your-own API keys, AES-GCM encrypted with BYOK_ENCRYPTION_KEY.
  // When present, that user's runs bill their accounts, not ours.
  apiKeys: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("openrouter"), v.literal("fal")),
    ciphertext: v.string(),
    last4: v.string(),
  }).index("by_user_provider", ["userId", "provider"]),

  // Singleton row of admin-configurable app settings.
  appSettings: defineTable({
    // OpenRouter slug for the LLM phases (research + copywriting).
    textModel: v.optional(v.string()),
    // FAL endpoint id for image generation (edit variant is derived).
    imageModel: v.optional(v.string()),
  }),

  signupLinks: defineTable({
    token: v.string(),
    planId: v.id("plans"),
    label: v.optional(v.string()),
    active: v.boolean(),
  }).index("by_token", ["token"]),

  projects: defineTable({
    userId: v.id("users"),
    name: v.string(),
    brandName: v.string(),
    brandUrl: v.string(),
    productName: v.string(),
    status: projectStatus,
    selectedTemplateIds: v.optional(v.array(v.id("templates"))),
    researchError: v.optional(v.string()),
    promptError: v.optional(v.string()),
    // Brand logo, attached as a reference so renders reproduce it exactly.
    logoImageId: v.optional(v.id("_storage")),
    // FAL storage URL, cached after first upload.
    logoFalUrl: v.optional(v.string()),
    // Set when this project was duplicated from another (Brand DNA reused).
    sourceProjectId: v.optional(v.id("projects")),
  }).index("by_user", ["userId"]),

  productImages: defineTable({
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    filename: v.string(),
    // FAL storage URL, cached after first upload so each image uploads once.
    falUrl: v.optional(v.string()),
  }).index("by_project", ["projectId"]),

  brandDna: defineTable({
    projectId: v.id("projects"),
    document: v.string(),
    promptModifier: v.string(),
  }).index("by_project", ["projectId"]),

  templates: defineTable({
    number: v.number(),
    name: v.string(),
    // One human line shown on the format picker.
    description: v.optional(v.string()),
    body: v.string(),
    aspectRatio,
    needsProductImages: v.boolean(),
    category: v.optional(v.string()),
    // undefined => shared system template; set => private custom template.
    userId: v.optional(v.id("users")),
    // Optional layout/style example image shown to the image model.
    exampleImageId: v.optional(v.id("_storage")),
    // FAL storage URL, cached after first upload.
    exampleFalUrl: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  prompts: defineTable({
    projectId: v.id("projects"),
    templateNumber: v.number(),
    templateName: v.string(),
    prompt: v.string(),
    aspectRatio,
    needsProductImages: v.boolean(),
    notes: v.optional(v.string()),
    // Source template, so generation can pick up its style example.
    templateId: v.optional(v.id("templates")),
  }).index("by_project", ["projectId"]),

  jobs: defineTable({
    projectId: v.id("projects"),
    promptId: v.id("prompts"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("error"),
    ),
    quality: jobQuality,
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    // What this job's finished image replaces: prior runs' images for
    // the same ad (full runs), one specific image (regenerate-one), or
    // nothing (retry — the image is added alongside).
    replaces: v.optional(
      v.union(v.literal("previous-runs"), v.id("images")),
    ),
    // Placement spin-off: re-render `sourceImageId` (used as a content
    // reference) at `aspectRatioOverride` instead of the prompt's ratio.
    sourceImageId: v.optional(v.id("images")),
    aspectRatioOverride: v.optional(aspectRatio),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_prompt", ["promptId"]),

  images: defineTable({
    projectId: v.id("projects"),
    promptId: v.id("prompts"),
    jobId: v.id("jobs"),
    storageId: v.id("_storage"),
    // Copies so gallery entries survive prompt regeneration.
    templateName: v.string(),
    promptText: v.string(),
    aspectRatio: v.string(),
    width: v.number(),
    height: v.number(),
    // Set on placement spin-offs: the winning image this was derived from.
    spinoffOf: v.optional(v.id("images")),
  })
    .index("by_project", ["projectId"])
    .index("by_prompt", ["promptId"]),
});
