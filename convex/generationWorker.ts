"use node";
import { fal } from "@fal-ai/client";
import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { decryptSecret } from "./lib/secretbox";

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

/** What is attached to a render, in `image_urls` order. */
type ReferencePlan = {
  // Spin-offs: the approved ad being adapted (takes the style slot).
  source: { width: number; height: number; ratio: string } | null;
  // The template's layout/style example (never for spin-offs).
  style: boolean;
  logo: boolean;
  productCount: number;
};

/**
 * Tells the model what each attached reference image is for. Without
 * this it treats references as loose inspiration and invents its own
 * version of the product (especially UI screenshots) or logo. Images
 * are always attached in this order: source ad or style example,
 * logo, product photos; each one is described by its position.
 *
 * With no logo and no source ad this keeps the original, proven
 * wording for the style-only / product-only / both cases.
 */
function referenceInstructions(plan: ReferencePlan): string {
  const { source, style, logo, productCount } = plan;
  if (!source && !logo) {
    if (style && productCount > 0) {
      return (
        " The FIRST attached reference image is a LAYOUT EXAMPLE only: imitate" +
        " its composition, arrangement, and ad format, but never its brand or" +
        " copy. The remaining reference images show the real product: depict" +
        " that exact product faithfully — same design, branding, colors, and" +
        " packaging or interface details. Do not invent a different version" +
        " of the product."
      );
    }
    if (style) {
      return (
        " The attached reference image is a LAYOUT EXAMPLE only. Imitate its" +
        " composition, arrangement, and ad format, but use the brand, colors," +
        " and text described in this prompt — never the example's brand or" +
        " copy."
      );
    }
    if (productCount > 0) {
      return (
        " The attached reference images show the real product. Depict this" +
        " exact product faithfully — same design, branding, colors, and" +
        " interface or packaging details as the references. Do not invent a" +
        " different version of the product."
      );
    }
    return "";
  }

  const parts: string[] = [];
  let position = 1;
  if (source) {
    parts.push(
      `Reference image ${position} is the APPROVED AD to adapt. Recreate this` +
        " exact ad, with the same headline and copy verbatim and the same" +
        " product, colors, typography, and mood, recomposed for a" +
        ` ${source.width}x${source.height} (${source.ratio}) canvas. Extend` +
        " backgrounds naturally, keep all text fully inside the frame and" +
        " legible, and do not add, drop, or reword any text.",
    );
    position++;
  } else if (style) {
    parts.push(
      `Reference image ${position} is a LAYOUT EXAMPLE only: imitate its` +
        " composition, arrangement, and ad format, but use the brand, colors," +
        " and text described in this prompt — never the example's brand," +
        " logo, or copy.",
    );
    position++;
  }
  if (logo) {
    parts.push(
      `Reference image ${position} is the brand's LOGO: reproduce it exactly,` +
        " with its real shape, colors, and proportions, wherever the ad shows" +
        " a logo; never redraw, restyle, or re-letter it, and do not add it" +
        " where the ad has no place for a logo.",
    );
    position++;
  }
  if (productCount > 0) {
    const which =
      productCount === 1
        ? `Reference image ${position} shows`
        : `Reference images ${position}-${position + productCount - 1} show`;
    parts.push(
      `${which} the real product: depict this exact product faithfully — same` +
        " design, branding, colors, and packaging or interface details. Do" +
        " not invent a different version of the product.",
    );
  }
  return " " + parts.join(" ");
}

/** Uploads a stored file to FAL storage and returns its URL. */
async function uploadToFal(blob: Blob, name: string): Promise<string> {
  const type = blob.type || "image/png";
  const extension =
    type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
  const file = new File([blob], `${name}.${extension}`, { type });
  return await fal.storage.upload(file);
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

    const settings = await ctx.runQuery(internal.settings.getForRun, {});
    const byok = await ctx.runQuery(internal.apiKeys.ciphertextsForProject, {
      projectId: args.projectId,
    });
    fal.config({
      credentials: byok.fal
        ? await decryptSecret(byok.fal)
        : process.env.FAL_KEY,
    });
    const { job, prompt, productImages, styleRef, logoRef, sourceRef } =
      bundle;
    try {
      // Spin-offs: the approved ad itself is the main reference. It has
      // no FAL cache field, so it uploads once per job.
      let sourceUrl: string | null = null;
      if (sourceRef) {
        const blob = await ctx.storage.get(sourceRef.storageId);
        if (!blob) throw new Error("The original ad's image file is missing.");
        sourceUrl = await uploadToFal(blob, "approved-ad");
      }

      // Template style example: upload to FAL once, cache on the template.
      let styleUrl: string | null = null;
      if (styleRef && !sourceRef) {
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

      // Brand logo: attached to every render (it applies even when the
      // ad doesn't show the product). Upload once, cache on the project.
      let logoUrl: string | null = null;
      if (logoRef) {
        if (logoRef.falUrl) {
          logoUrl = logoRef.falUrl;
        } else {
          const blob = await ctx.storage.get(logoRef.storageId);
          if (blob) {
            logoUrl = await uploadToFal(blob, "brand-logo");
            await ctx.runMutation(internal.brandLogo.setFalUrl, {
              projectId: args.projectId,
              storageId: logoRef.storageId,
              falUrl: logoUrl,
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

      // Order matters: referenceInstructions describes each image by
      // its position. Source ad (or style example), logo, products.
      const leadUrl = sourceUrl ?? styleUrl;
      const imageUrls = [
        ...(leadUrl ? [leadUrl] : []),
        ...(logoUrl ? [logoUrl] : []),
        ...productUrls,
      ];
      const useEdit = imageUrls.length > 0;
      // Spin-offs carry the override ratio in prompt.aspectRatio.
      const size = mapAspect(prompt.aspectRatio);
      const instructions = referenceInstructions({
        source: sourceUrl
          ? { width: size.width, height: size.height, ratio: prompt.aspectRatio }
          : null,
        style: styleUrl !== null && !sourceUrl,
        logo: logoUrl !== null,
        productCount: productUrls.length,
      });
      // A spin-off leads with the adaptation instructions; the original
      // brief follows as context, since it may describe the old canvas.
      const promptText = sourceUrl
        ? `${instructions.trim()}\n\nOriginal brief, for context only. Where` +
          " it conflicts with the approved ad or the new canvas, follow the" +
          ` approved ad and the new canvas: ${prompt.prompt}`
        : prompt.prompt + instructions;
      // Admin-configurable FAL endpoint; references go to its /edit
      // variant. Params adapt per model family: quality is a gpt-image
      // concept, aspect_ratio is what Gemini-style models expect.
      const model = settings.imageModel;
      const isGptImage = model.startsWith("openai/gpt-image");
      const endpoint = useEdit ? `${model}/edit` : model;
      const input: Record<string, unknown> = {
        prompt: promptText,
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
