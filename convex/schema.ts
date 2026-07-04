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
  }),

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
  })
    .index("by_project", ["projectId"])
    .index("by_prompt", ["promptId"]),
});
