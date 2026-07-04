"use node";
import { fal } from "@fal-ai/client";
import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** PRD §8 aspect-ratio -> image-size mapping. */
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

/**
 * Suffixes that tell the model what each attached reference image is
 * for. Without them it treats references as loose inspiration and
 * invents its own version of the product (especially UI screenshots).
 * When a style example is attached it is always FIRST in image_urls.
 */
const PRODUCT_ONLY_SUFFIX =
  " The attached reference images show the real product. Depict this exact" +
  " product faithfully — same design, branding, colors, and interface or" +
  " packaging details as the references. Do not invent a different version" +
  " of the product.";

const STYLE_ONLY_SUFFIX =
  " The attached reference image is a LAYOUT EXAMPLE only. Imitate its" +
  " composition, arrangement, and ad format, but use the brand, colors, and" +
  " text described in this prompt — never the example's brand or copy.";

const STYLE_AND_PRODUCT_SUFFIX =
  " The FIRST attached reference image is a LAYOUT EXAMPLE only: imitate its" +
  " composition, arrangement, and ad format, but never its brand or copy." +
  " The remaining reference images show the real product: depict that exact" +
  " product faithfully — same design, branding, colors, and packaging or" +
  " interface details. Do not invent a different version of the product.";

function falErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    // FAL validation errors carry details in `body.detail`.
    const body = (error as { body?: { detail?: unknown } }).body;
    if (body?.detail) {
      const detail = body.detail;
      if (typeof detail === "string") return detail;
      try {
        return JSON.stringify(detail).slice(0, 400);
      } catch {
        // fall through
      }
    }
  }
  if (error instanceof Error) return error.message;
  return "Image generation failed.";
}

/**
 * Phase 3 worker: claims one queued job, runs one FAL call, stores the
 * image in Convex storage, then reschedules itself. A bounded pool of
 * these workers (see `concurrencyCap` in generation.ts) drains the
 * queue — never a single long blocking run, never an unbounded fan-out
 * of FAL calls.
 */
export const processQueue = internalAction({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const bundle = await ctx.runMutation(internal.generation.claimNext, {
      projectId: args.projectId,
    });
    if (!bundle) return null; // Queue drained or another worker is on it.

    fal.config({ credentials: process.env.FAL_KEY });
    const settings = await ctx.runQuery(internal.settings.getForRun, {});
    const { job, prompt, productImages, styleRef } = bundle;
    try {
      // Template style example: upload to FAL once, cache on the template.
      let styleUrl: string | null = null;
      if (styleRef) {
        if (styleRef.falUrl) {
          styleUrl = styleRef.falUrl;
        } else {
          const blob = await ctx.storage.get(styleRef.storageId);
          if (blob) {
            const file = new File([blob], "style-example.png", {
              type: blob.type || "image/png",
            });
            styleUrl = await fal.storage.upload(file);
            await ctx.runMutation(internal.templates.setExampleFalUrl, {
              templateId: styleRef.templateId,
              falUrl: styleUrl,
            });
          }
        }
      }

      // Product references: upload each stored image to FAL once and
      // cache the URL on the row.
      const productUrls: string[] = [];
      if (prompt.needsProductImages) {
        for (const productImage of productImages) {
          if (productImage.falUrl) {
            productUrls.push(productImage.falUrl);
            continue;
          }
          const blob = await ctx.storage.get(productImage.storageId);
          if (!blob) continue;
          const file = new File(
            [blob],
            productImage.filename || "product.png",
            { type: blob.type || "image/png" },
          );
          const falUrl = await fal.storage.upload(file);
          await ctx.runMutation(internal.productImages.setFalUrl, {
            imageId: productImage._id,
            falUrl,
          });
          productUrls.push(falUrl);
        }
      }

      // Style example first, then product photos — the suffixes below
      // reference this ordering.
      const imageUrls = [...(styleUrl ? [styleUrl] : []), ...productUrls];
      const useEdit = imageUrls.length > 0;
      const suffix =
        styleUrl && productUrls.length > 0
          ? STYLE_AND_PRODUCT_SUFFIX
          : styleUrl
            ? STYLE_ONLY_SUFFIX
            : productUrls.length > 0
              ? PRODUCT_ONLY_SUFFIX
              : "";
      // Admin-configurable FAL endpoint; references go to its /edit
      // variant. Params adapt per model family: quality is a gpt-image
      // concept, aspect_ratio is what Gemini-style models expect.
      const model = settings.imageModel;
      const isGptImage = model.startsWith("openai/gpt-image");
      const endpoint = useEdit ? `${model}/edit` : model;
      const size = mapAspect(prompt.aspectRatio);
      const input: Record<string, unknown> = {
        prompt: prompt.prompt + suffix,
        image_size: size,
        num_images: 1,
        output_format: "png",
      };
      if (isGptImage) {
        input.quality = job.quality;
      } else {
        input.aspect_ratio = prompt.aspectRatio;
      }
      if (useEdit) input.image_urls = imageUrls;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await fal.subscribe(endpoint as any, { input } as any);
      const output = (
        result.data as {
          images?: Array<{ url?: string; width?: number; height?: number }>;
        }
      ).images?.[0];
      if (!output?.url) throw new Error("FAL returned no image.");

      const download = await fetch(output.url);
      if (!download.ok) {
        throw new Error(`Could not download the image (${download.status}).`);
      }
      const bytes = await download.arrayBuffer();
      const storageId = await ctx.storage.store(
        new Blob([bytes], { type: "image/png" }),
      );
      await ctx.runMutation(internal.generation.completeJob, {
        jobId: job._id,
        storageId,
        width: output.width ?? size.width,
        height: output.height ?? size.height,
      });
    } catch (error) {
      await ctx.runMutation(internal.generation.failJob, {
        jobId: job._id,
        message: falErrorMessage(error),
      });
    }
    // Keep draining the queue.
    await ctx.scheduler.runAfter(500, internal.generationWorker.processQueue, {
      projectId: args.projectId,
    });
    return null;
  },
});
