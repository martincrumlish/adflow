/**
 * Shared helpers for AdFlow's transactional email (welcome, password
 * reset, delivery test), sent through Postmark's REST API. Runs in the
 * default Convex runtime; no SDK needed.
 */

/**
 * The From header. Postmark only accepts senders on a verified Sender
 * Signature or domain, so AUTH_EMAIL_FROM must be a full address, either
 * bare ("hello@example.com") or with a display name
 * ("AdFlow <hello@example.com>"). A bare display name has no address to
 * send from, so it is reported as a configuration error at send time.
 */
export function fromAddress(): string {
  return process.env.AUTH_EMAIL_FROM?.trim() || "";
}

function fromIsValid(from: string): boolean {
  const address = from.includes("<")
    ? (from.match(/<([^>]+)>/)?.[1] ?? "")
    : from;
  return /^\S+@\S+\.\S+$/.test(address.trim());
}

/** Absolute app URL for links in emails, without a trailing slash. */
export function siteUrl(): string {
  const configured = process.env.SITE_URL?.trim() || "http://localhost:3000";
  return configured.replace(/\/+$/, "");
}

/** Escapes text for safe interpolation into HTML content or attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COLORS = {
  page: "#f4f4f6",
  card: "#ffffff",
  border: "#e4e4e9",
  text: "#1c1c22",
  muted: "#6b6b76",
  brand: "#4f4bd0",
  brandText: "#ffffff",
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'";

/** Inline styles for common body elements, so emails stay consistent. */
export const emailStyles = {
  paragraph: `margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: ${COLORS.text};`,
  muted: `margin: 16px 0 0; font-size: 13px; line-height: 1.5; color: ${COLORS.muted};`,
  panel: `margin: 0 0 20px; padding: 16px; background: ${COLORS.page}; border: 1px solid ${COLORS.border}; border-radius: 8px;`,
  mono: "font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;",
} as const;

/** A primary call-to-action link styled as a button. */
export function button(href: string, label: string): string {
  return (
    `<p style="margin: 24px 0;">` +
    `<a href="${escapeHtml(href)}" style="display: inline-block; padding: 12px 22px; ` +
    `background: ${COLORS.brand}; color: ${COLORS.brandText}; border-radius: 8px; ` +
    `font-size: 15px; font-weight: 600; line-height: 1; text-decoration: none;">` +
    `${escapeHtml(label)}</a></p>`
  );
}

/**
 * Wraps body HTML in AdFlow's email shell: wordmark, white card with the
 * title as a heading, and a muted footer. `title` and `preheader` are
 * plain text and get escaped; `bodyHtml` is trusted markup, so escape any
 * user-provided values inside it with `escapeHtml`.
 */
export function emailLayout({
  title,
  preheader,
  bodyHtml,
}: {
  title: string;
  preheader?: string;
  bodyHtml: string;
}): string {
  const preheaderHtml = preheader
    ? `<div style="display: none; max-height: 0; max-width: 0; overflow: hidden; opacity: 0; mso-hide: all; font-size: 1px; line-height: 1px; color: ${COLORS.page};">${escapeHtml(preheader)}</div>`
    : "";

  return [
    `<!DOCTYPE html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<meta name="color-scheme" content="light">`,
    `<meta name="supported-color-schemes" content="light">`,
    `<title>${escapeHtml(title)}</title>`,
    `</head>`,
    `<body style="margin: 0; padding: 0; background: ${COLORS.page}; font-family: ${FONT_STACK}; color: ${COLORS.text}; -webkit-text-size-adjust: 100%;">`,
    preheaderHtml,
    `<div style="max-width: 520px; margin: 0 auto; padding: 32px 16px;">`,
    `<div style="padding: 0 4px 20px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: ${COLORS.text};">Ad<span style="color: ${COLORS.brand};">Flow</span></div>`,
    `<div style="background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 32px 28px;">`,
    `<h1 style="margin: 0 0 20px; font-size: 22px; line-height: 1.3; font-weight: 700; color: ${COLORS.text};">${escapeHtml(title)}</h1>`,
    bodyHtml,
    `</div>`,
    `<p style="margin: 20px 4px 0; font-size: 12px; line-height: 1.5; color: ${COLORS.muted};">You are receiving this because you have an AdFlow account.</p>`,
    `</div>`,
    `</body>`,
    `</html>`,
  ].join("\n");
}

export type SendEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Sends one email through Postmark (https://postmarkapp.com/developer).
 * Env: POSTMARK_SERVER_TOKEN (required), AUTH_EMAIL_FROM (a verified
 * sender), POSTMARK_MESSAGE_STREAM (optional, defaults to "outbound",
 * Postmark's default transactional stream). Never throws: failures are
 * logged and returned so callers decide whether they matter.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  tag,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Postmark tag, for filtering in the activity view. */
  tag?: string;
}): Promise<SendEmailResult> {
  const fail = (error: string): SendEmailResult => {
    console.error(`Email "${subject}" not sent: ${error}`);
    return { ok: false, error };
  };
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    return fail("POSTMARK_SERVER_TOKEN is not set on the Convex deployment.");
  }
  const from = fromAddress();
  if (!fromIsValid(from)) {
    return fail(
      "AUTH_EMAIL_FROM must be a verified Postmark sender address, e.g. AdFlow <hello@yourdomain.com>.",
    );
  }
  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: from,
        To: Array.isArray(to) ? to.join(",") : to,
        Subject: subject,
        HtmlBody: html,
        ...(text ? { TextBody: text } : {}),
        MessageStream: process.env.POSTMARK_MESSAGE_STREAM?.trim() || "outbound",
        ...(tag ? { Tag: tag } : {}),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ErrorCode?: number;
      Message?: string;
    };
    if (!response.ok || (payload.ErrorCode ?? 0) !== 0) {
      return fail(
        `Postmark ${response.status}${payload.ErrorCode ? ` (error ${payload.ErrorCode})` : ""}: ${payload.Message ?? response.statusText}`,
      );
    }
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
