"use node";
import { ConvexError, v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { promptGenerationPrompt } from "./lib/prompts";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5";

const VALID_ASPECTS = ["1:1", "4:5", "9:16"] as const;
type Aspect = (typeof VALID_ASPECTS)[number];

function coerceAspect(value: unknown, fallback: Aspect): Aspect {
  return VALID_ASPECTS.includes(value as Aspect) ? (value as Aspect) : fallback;
}

/** Strips markdown fences and grabs the outermost JSON object. */
function parseJsonResponse(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("The model did not return JSON.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Phase 2: fill every selected template with brand-specific copy via
 * OpenRouter (no web search) and persist the resulting prompts.
 */
export const run = action({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.projects.getOwned, {
      projectId: args.projectId,
    });
    if (project.status === "prompting") {
      throw new ConvexError("Prompt generation is already running.");
    }
    if (project.status === "generating") {
      throw new ConvexError("Wait for image generation to finish first.");
    }
    const bundle = await ctx.runQuery(internal.generation.getPromptGenInputs, {
      projectId: args.projectId,
    });
    if (!bundle.brandDna) {
      throw new ConvexError("Run brand research before generating prompts.");
    }
    if (bundle.templates.length === 0) {
      throw new ConvexError("Select at least one template first.");
    }
    await ctx.runMutation(internal.prompts.setPrompting, {
      projectId: args.projectId,
    });
    try {
      const client = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.SITE_URL ?? "http://localhost:3000",
          "X-Title": "AdFlow",
        },
      });
      const response = await client.chat.completions.create({
        model: OPENROUTER_MODEL,
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: promptGenerationPrompt(
              project.productName,
              bundle.brandDna.document,
              bundle.templates,
            ),
          },
        ],
      });
      const raw = response.choices[0]?.message?.content ?? "";
      const parsed = parseJsonResponse(raw) as {
        prompts?: Array<Record<string, unknown>>;
      };
      if (!Array.isArray(parsed.prompts) || parsed.prompts.length === 0) {
        throw new Error("The model returned no prompts.");
      }
      const byNumber = new Map(bundle.templates.map((t) => [t.number, t]));
      const prompts = parsed.prompts.map((p) => {
        const template = byNumber.get(Number(p.template_number));
        const promptText = typeof p.prompt === "string" ? p.prompt.trim() : "";
        if (!promptText) {
          throw new Error(
            `Template ${String(p.template_number)} came back without a prompt.`,
          );
        }
        return {
          templateNumber: Number(p.template_number) || template?.number || 0,
          templateName:
            typeof p.template_name === "string" && p.template_name
              ? p.template_name
              : (template?.name ?? "template"),
          prompt: promptText,
          aspectRatio: coerceAspect(
            p.aspect_ratio,
            (template?.aspectRatio as Aspect) ?? "1:1",
          ),
          needsProductImages:
            typeof p.needs_product_images === "boolean"
              ? p.needs_product_images
              : (template?.needsProductImages ?? false),
          notes:
            typeof p.notes === "string" && p.notes.trim()
              ? p.notes.trim()
              : undefined,
        };
      });
      await ctx.runMutation(internal.prompts.replaceAll, {
        projectId: args.projectId,
        prompts,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Prompt generation failed.";
      await ctx.runMutation(internal.prompts.setPromptError, {
        projectId: args.projectId,
        message: message.slice(0, 500),
      });
      throw new ConvexError(
        `Prompt generation failed: ${message.slice(0, 200)}`,
      );
    }
    return null;
  },
});
