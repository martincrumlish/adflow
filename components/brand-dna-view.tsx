"use client";

import { Fragment } from "react";

/**
 * Renders the Brand DNA document as designed sections instead of raw
 * model output: known headers become section titles, "Label: value"
 * bullets become definition rows, markdown markers are stripped, and
 * hex codes get live color swatches. Falls back to plain text when the
 * document doesn't match the expected shape.
 */

const SECTION_TITLES: Record<string, string> = {
  "BRAND OVERVIEW": "Brand overview",
  "VISUAL SYSTEM": "Visual system",
  "PHOTOGRAPHY DIRECTION": "Photography direction",
  "PRODUCT DETAILS": "Product details",
  "AD CREATIVE STYLE": "Ad creative style",
  "COMPETITIVE CONTEXT": "Competitive context",
};

/** Shown in its own card, so it's excluded from the document body. */
const MODIFIER_HEADER = "IMAGE GENERATION PROMPT MODIFIER";

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#+\s*/, "")
    .replace(/`/g, "")
    .trim();
}

function headerKey(line: string): string | null {
  // Models often annotate headers, e.g. "VISUAL SYSTEM (inferred from
  // category norms)" — the annotation isn't part of the header.
  const stripped = stripMarkdown(line)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[:*\s]+$/, "")
    .trim();
  if (!stripped || stripped.length < 4 || stripped.length > 60) return null;
  const upper = stripped.toUpperCase();
  if (SECTION_TITLES[upper] || upper === MODIFIER_HEADER) {
    return upper;
  }
  if (/^[A-Z][A-Z0-9 /&'-]+$/.test(stripped)) return upper;
  return null;
}

function titleCase(header: string): string {
  const lower = header.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

type SectionItem = { label: string; value: string } | { text: string };
type Section = { title: string; items: SectionItem[] };

export function parseBrandDna(document: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let skipping = false;

  for (const rawLine of document.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[=\-_*—]{3,}$/.test(line)) continue;
    const strippedUpper = stripMarkdown(line).toUpperCase();
    if (strippedUpper.startsWith("BRAND DNA DOCUMENT")) continue;

    const key = headerKey(line);
    if (key) {
      if (key === MODIFIER_HEADER) {
        skipping = true;
        current = null;
        continue;
      }
      skipping = false;
      current = { title: SECTION_TITLES[key] ?? titleCase(key), items: [] };
      sections.push(current);
      continue;
    }
    if (skipping || !current) continue; // preamble or modifier body

    const content = stripMarkdown(line.replace(/^[-•*]\s+/, ""));
    const labelMatch = content.match(
      /^([A-Za-z][A-Za-z0-9 ./&'()[\]-]{1,44}?):\s+(.+)$/,
    );
    if (labelMatch) {
      current.items.push({ label: labelMatch[1], value: labelMatch[2] });
    } else {
      current.items.push({ text: content });
    }
  }
  return sections.filter((section) => section.items.length > 0);
}

const HEX_PATTERN = /(#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b)/g;
const HEX_EXACT = /^#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

/** Text with inline color swatches wherever a hex code appears. */
export function HexText({ text }: { text: string }) {
  const parts = text.split(HEX_PATTERN);
  return (
    <>
      {parts.map((part, index) =>
        HEX_EXACT.test(part) ? (
          <span
            key={index}
            className="inline-flex items-baseline gap-1 whitespace-nowrap"
          >
            <span
              aria-hidden
              className="inline-block size-2.5 self-center rounded-[3px] border border-border"
              style={{ backgroundColor: part }}
            />
            <code className="font-mono text-[0.85em]">{part}</code>
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function BrandDnaDocument({ document }: { document: string }) {
  const sections = parseBrandDna(document);

  if (sections.length === 0) {
    return (
      <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
        {document}
      </pre>
    );
  }

  return (
    <div className="max-h-[36rem] space-y-6 overflow-y-auto pr-1">
      {sections.map((section, sectionIndex) => (
        <section key={sectionIndex}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </h3>
          <div className="space-y-1.5">
            {section.items.map((item, itemIndex) =>
              "label" in item ? (
                <div
                  key={itemIndex}
                  className="grid grid-cols-[10rem_1fr] gap-3 text-sm"
                >
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="leading-relaxed">
                    <HexText text={item.value} />
                  </span>
                </div>
              ) : (
                <p key={itemIndex} className="text-sm leading-relaxed">
                  <HexText text={item.text} />
                </p>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
