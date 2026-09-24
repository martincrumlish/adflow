/**
 * Estimated USD cost per AI call, recorded on each usageEvents row.
 *
 * These are ESTIMATES for admin visibility (the Usage page), not
 * billing: real spend depends on token counts, reference images, and
 * provider pricing changes. Tune the numbers here when pricing moves;
 * past events keep the estimate they were recorded with.
 */

export type UsageKind = "image" | "research" | "copy";
export type ImageQuality = "low" | "medium" | "high";

/** gpt-image family, priced per render by quality tier. */
const GPT_IMAGE_COST: Record<ImageQuality, number> = {
  low: 0.02,
  medium: 0.07,
  high: 0.19,
};

/** Any other image model (Gemini, Flux, ...): one flat rate per render. */
const OTHER_IMAGE_COST = 0.05;

/** Brand research: web-search tool calls plus a long document. */
const RESEARCH_COST = 0.15;

/** Copywriting: one long completion, no tools. */
const COPY_COST = 0.05;

export function estimateCost(
  kind: UsageKind,
  model: string,
  quality?: ImageQuality,
): number {
  switch (kind) {
    case "image":
      if (model.includes("gpt-image")) {
        return GPT_IMAGE_COST[quality ?? "high"];
      }
      return OTHER_IMAGE_COST;
    case "research":
      return RESEARCH_COST;
    case "copy":
      return COPY_COST;
  }
}

/** The quota window a moment falls in, as UTC "YYYY-MM". */
export function monthKey(date: Date = new Date()): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

/** Start of the next UTC calendar month, in ms: when allowances reset. */
export function nextMonthStart(date: Date = new Date()): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}
