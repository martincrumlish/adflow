"use node";
import { ConvexError, v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { brandResearchPrompt, extractPromptModifier } from "./lib/prompts";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5";

/**
 * Phase 1: brand research via OpenRouter with its server-side
 * web-search tool. Produces the Brand DNA document + prompt modifier.
 */
export const run = action({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.projects.getOwned, {
      projectId: args.projectId,
    });
    if (project.status === "researching") {
      throw new ConvexError("Research is already running.");
    }
    if (project.status === "generating") {
      throw new ConvexError("Wait for image generation to finish first.");
    }
    await ctx.runMutation(internal.brandDna.setResearching, {
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
        max_tokens: 8000,
        tools: [
          {
            type: "openrouter:web_search",
            parameters: { engine: "auto", max_total_results: 20 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
        messages: [
          {
            role: "user",
            content: brandResearchPrompt(project.brandName, project.brandUrl),
          },
        ],
      });
      const document = response.choices[0]?.message?.content ?? "";
      if (!document.trim()) {
        throw new Error("The model returned an empty document.");
      }
      const promptModifier = extractPromptModifier(document);
      await ctx.runMutation(internal.brandDna.saveResearch, {
        projectId: args.projectId,
        document,
        promptModifier,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Brand research failed.";
      await ctx.runMutation(internal.brandDna.setResearchError, {
        projectId: args.projectId,
        message: message.slice(0, 500),
      });
      throw new ConvexError(`Brand research failed: ${message.slice(0, 200)}`);
    }
    return null;
  },
});
