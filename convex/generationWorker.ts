"use node";
import { fal } from "@fal-ai/client";
import { v } from "convex/values";
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
 * image in Convex storage, then reschedules itself. Jobs are strictly
 * sequential per project — never a long blocking run, never parallel
 * FAL calls.
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
    const { job, prompt, productImages } = bundle;
    try {
      // Product references: upload each stored image to FAL once and
      // cache the URL on the row.
      const imageUrls: string[] = [];
      if (prompt.needsProductImages) {
        for (const productImage of productImages) {
          if (productImage.falUrl) {
            imageUrls.push(productImage.falUrl);
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
          imageUrls.push(falUrl);
        }
      }

      const useEdit = prompt.needsProductImages && imageUrls.length > 0;
      const endpoint = useEdit
        ? "openai/gpt-image-2/edit"
        : "openai/gpt-image-2";
      const size = mapAspect(prompt.aspectRatio);
      const input: Record<string, unknown> = {
        prompt: prompt.prompt,
        image_size: size,
        quality: job.quality,
        num_images: 1,
        output_format: "png",
      };
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
