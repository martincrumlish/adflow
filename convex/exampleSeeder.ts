"use node";
import { fal } from "@fal-ai/client";
import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { promptGenerationPrompt } from "./lib/prompts";

/**
 * Generates a preview render for every system template that lacks one,
 * using a fictional demo brand, and attaches it as the template's
 * example image. Self-reschedules in batches to stay inside action
 * time limits. Idempotent: only templates without an example are
 * processed. Run with: npx convex run exampleSeeder:generateExamples
 */

const DEMO_PRODUCT = "Fern & Fog Botanical Tea";

const DEMO_BRAND_DNA = `BRAND DNA DOCUMENT
==================
BRAND OVERVIEW
Name: Fern & Fog
Tagline: "Calm in a cup."
Voice Adjectives: Warm, Wry, Grounded, Crisp, Optimistic
Positioning: A premium botanical tea brand for people who take small rituals seriously.

VISUAL SYSTEM
Primary Font: Modern high-contrast serif for headlines
Secondary Font: Clean geometric sans-serif for body text
Primary Color: #0E4F4F deep evergreen
Secondary Color: #FAF6EE warm cream
Accent Color: #E86A33 burnt sienna
Background Colors: warm cream #FAF6EE, deep evergreen #0E4F4F
CTA Color and Style: burnt sienna pill buttons with cream text

PHOTOGRAPHY DIRECTION
Lighting: Soft window light, gentle shadows
Color Grading: Warm, slightly muted, film-like
Composition: Centered product, generous negative space
Subject Matter: Tea tins, ceramic cups, botanical sprigs
Props and Surfaces: Linen, oak, stoneware
Mood: Calm, tactile, quietly premium

PRODUCT DETAILS
Physical Description: Matte deep-evergreen tea tin with a cream label and burnt-sienna serif wordmark
Label-Logo Placement: Centered cream label with serif wordmark
Distinctive Features: Embossed lid, fine botanical line illustration
Packaging System: Tins in evergreen, cream, and sienna variants

AD CREATIVE STYLE
Typical formats: Clean studio product shots, editorial stills
Text overlay style: Serif headlines in evergreen or cream
Photo vs illustration: Photography with fine botanical line-art accents
UGC usage: Warm kitchen-counter phone shots
Offer presentation: Understated welcome offers

IMAGE GENERATION PROMPT MODIFIER
Render in Fern & Fog's brand style: warm cream (#FAF6EE) and deep evergreen (#0E4F4F) palette with burnt sienna (#E86A33) accents, modern high-contrast serif headlines with clean sans-serif support, soft window light, warm film-like color grading, centered compositions with generous negative space, linen and oak surfaces, fine botanical line-art details, calm and quietly premium mood.`;

function mapAspect(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case "4:5":
      return { width: 1024, height: 1280 };
    case "9:16":
      return { width: 864, height: 1536 };
    default:
      return { width: 1024, height: 1024 };
  }
}

function parseJson(raw: string): { prompts?: Array<Record<string, unknown>> } {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model returned no JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

export const generateExamples = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const limit = Math.max(1, Math.min(8, args.limit ?? 6));
    const all = await ctx.runQuery(internal.templates.listSystemInternal, {});
    const pending = all.filter((t) => !t.hasExample);
    if (pending.length === 0) {
      console.log("All system templates already have example images.");
      return 0;
    }
    const batch = pending.slice(0, limit);

    // One LLM call fills the whole batch with demo-brand copy.
    const settings = await ctx.runQuery(internal.settings.getForRun, {});
    const openai = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const completion = await openai.chat.completions.create({
      model: settings.textModel,
      max_tokens: 12000,
      messages: [
        {
          role: "user",
          content: promptGenerationPrompt(
            DEMO_PRODUCT,
            DEMO_BRAND_DNA,
            batch.map((t) => ({
              number: t.number,
              name: t.name,
              body: t.body,
              aspectRatio: t.aspectRatio,
              needsProductImages: t.needsProductImages,
            })),
          ),
        },
      ],
    });
    const parsed = parseJson(completion.choices[0]?.message?.content ?? "");
    const byNumber = new Map(batch.map((t) => [t.number, t]));

    fal.config({ credentials: process.env.FAL_KEY });
    const jobs = (parsed.prompts ?? []).flatMap((p) => {
      const template = byNumber.get(Number(p.template_number));
      const promptText = typeof p.prompt === "string" ? p.prompt : "";
      return template && promptText ? [{ template, promptText }] : [];
    });

    let done = 0;
    // Small parallel chunks: fast without hammering FAL.
    for (let i = 0; i < jobs.length; i += 3) {
      const chunk = jobs.slice(i, i + 3);
      await Promise.all(
        chunk.map(async ({ template, promptText }) => {
          try {
            const result = await fal.subscribe(
              "openai/gpt-image-2" as never,
              {
                input: {
                  prompt: promptText,
                  image_size: mapAspect(template.aspectRatio),
                  quality: "medium",
                  num_images: 1,
                  output_format: "png",
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            );
            const url = (
              result.data as { images?: Array<{ url?: string }> }
            ).images?.[0]?.url;
            if (!url) throw new Error("no image in FAL response");
            const bytes = await (await fetch(url)).arrayBuffer();
            const storageId = await ctx.storage.store(
              new Blob([bytes], { type: "image/png" }),
            );
            await ctx.runMutation(internal.templates.setExampleImage, {
              templateId: template._id,
              storageId,
            });
            done++;
            console.log(`example ready: ${template.name}`);
          } catch (error) {
            console.error(
              `example failed for ${template.name}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }),
      );
    }

    if (pending.length > batch.length) {
      await ctx.scheduler.runAfter(
        1000,
        internal.exampleSeeder.generateExamples,
        { limit },
      );
    }
    return done;
  },
});
