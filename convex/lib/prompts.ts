/** Prompt builders for the OpenRouter LLM phases (PRD §7.2 / §7.3). */

export function brandResearchPrompt(
  brandName: string,
  brandUrl: string,
): string {
  return `Role: Act as a Senior Brand Strategist conducting a full reverse-engineering of the target
brand's visual and verbal identity.

Objective: Create a comprehensive Brand DNA document that will be used to write highly specific
AI image generation prompts. Every detail matters because the output will be fed into an image
model that needs exact specifications.

Brand: ${brandName}
URL: ${brandUrl}

RESEARCH STEPS:

1. EXTERNAL RESEARCH (search the web for each):
   - Design credits: "who designed ${brandName} branding", "${brandName} design agency", "${brandName} rebrand"
   - Public brand assets: "${brandName} brand guidelines pdf", "${brandName} press kit", "${brandName} style guide"
   - Typography: "${brandName} font", "what font does ${brandName} use"
   - Colors: "${brandName} brand colors", "${brandName} hex codes", "${brandName} color palette"
   - Packaging: "${brandName} packaging design", "${brandName} product photography"
   - Advertising: "${brandName} Meta Ad Library" for current ad creative styles
   - Positioning: "${brandName} brand story", "${brandName} founding story", "${brandName} mission"

2. ON-SITE ANALYSIS (analyze the brand URL):
   - Voice and Tone: 5 distinct adjectives from hero copy, About page, product descriptions.
   - Photography Style: lighting, color grading, composition, subject matter.
   - Typography on site: headline weight, body weight, letter-spacing, distinctive treatments.
   - Color application: primary vs accent, background colors, CTA color.
   - Layout density: airy or dense, grid-based or organic.
   - Packaging details: materials, colors, shape, label placement, textures, matte vs gloss.

3. COMPETITIVE CONTEXT: 2-3 direct competitors and their visual differentiation.

4. OUTPUT the document exactly, using these headers:

BRAND DNA DOCUMENT
==================
BRAND OVERVIEW
Name / Tagline / Design Agency / Voice Adjectives [5] / Positioning / Competitive Differentiation

VISUAL SYSTEM
Primary Font / Secondary Font / Primary Color [hex] / Secondary Color [hex] / Accent Color [hex]
/ Background Colors / CTA Color and Style

PHOTOGRAPHY DIRECTION
Lighting / Color Grading / Composition / Subject Matter / Props and Surfaces / Mood

PRODUCT DETAILS
Physical Description / Label-Logo Placement / Distinctive Features / Packaging System

AD CREATIVE STYLE
Typical formats / Text overlay style / Photo vs illustration / UGC usage / Offer presentation

IMAGE GENERATION PROMPT MODIFIER
A single 50-75 word paragraph to prepend to any image prompt to match this brand's visual
identity. Include exact colors, font descriptions, photography direction, and mood.`;
}

export type TemplateForPrompt = {
  number: number;
  name: string;
  body: string;
  aspectRatio: string;
  needsProductImages: boolean;
};

export function promptGenerationPrompt(
  productName: string,
  brandDnaMarkdown: string,
  templates: TemplateForPrompt[],
): string {
  const templatesJson = JSON.stringify(
    templates.map((t) => ({
      number: t.number,
      name: t.name,
      body: t.body,
      aspectRatio: t.aspectRatio,
      needsProductImages: t.needsProductImages,
    })),
    null,
    2,
  );
  return `You are filling ad-image templates for ${productName}, aligned to the Brand DNA below.

BRAND DNA:
${brandDnaMarkdown}

TEMPLATES (array of {number, name, body, aspectRatio, needsProductImages}):
${templatesJson}

For EACH template:
1. Replace every [BRACKETED PLACEHOLDER] in body with brand-specific detail. Keep all literal ad
   copy inside double quotes so the image model renders it verbatim.
2. Prepend the IMAGE GENERATION PROMPT MODIFIER from the Brand DNA to the prompt.
3. Keep the template's aspect_ratio and needs_product_images unless the filled content clearly
   changes whether the product is shown.
4. Write copy in the brand's real voice; avoid generic filler.

Return ONLY valid JSON, no markdown or commentary:
{
  "prompts": [
    { "template_number": 1, "template_name": "headline",
      "prompt": "full completed prompt text ready for GPT Image 2",
      "aspect_ratio": "4:5", "needs_product_images": true, "notes": "optional" }
  ]
}`;
}

/** Strips markdown header/bold markers so headers match regardless of style. */
function stripMarkers(line: string): string {
  return line
    .trim()
    .replace(/^[#>*\s]+/, "")
    .replace(/[*:\s]+$/, "")
    .trim();
}

/**
 * Pulls the IMAGE GENERATION PROMPT MODIFIER paragraph out of a Brand
 * DNA document: everything after that header until the next ALL-CAPS
 * header line (or end of document). Tolerates markdown header markers
 * (##, **, etc.) since models format the document inconsistently.
 */
export function extractPromptModifier(document: string): string {
  const lines = document.split("\n");
  const headerIndex = lines.findIndex((line) =>
    stripMarkers(line)
      .toUpperCase()
      .startsWith("IMAGE GENERATION PROMPT MODIFIER"),
  );
  if (headerIndex === -1) return "";
  const collected: string[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const trimmed = line.trim();
    // Skip underline/divider rows.
    if (/^[=\-_*]{3,}$/.test(trimmed)) continue;
    // Stop at the next section header: a line that is already ALL CAPS
    // once markdown markers are stripped.
    const stripped = stripMarkers(line);
    if (stripped.length > 3 && /^[A-Z][A-Z0-9 /&-]+$/.test(stripped)) {
      break;
    }
    collected.push(line);
  }
  return collected.join("\n").trim();
}
