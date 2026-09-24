import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import {
  button,
  emailLayout,
  emailStyles,
  escapeHtml,
  fromAddress,
  sendEmail,
  siteUrl,
} from "./lib/email";

const sendResult = v.object({
  ok: v.boolean(),
  error: v.optional(v.string()),
});

type SendResult = { ok: boolean; error?: string };

/** What the welcome email needs to know about a new account. */
export const welcomeRecipient = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      name: v.optional(v.string()),
      planName: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.email) return null;
    const plan = user.planId ? await ctx.db.get(user.planId) : null;
    const name = user.name?.trim();
    return {
      email: user.email,
      ...(name ? { name } : {}),
      ...(plan ? { planName: plan.name } : {}),
    };
  },
});

function welcomeEmail({
  email,
  name,
  planName,
  password,
}: {
  email: string;
  name?: string;
  planName?: string;
  password?: string;
}): { subject: string; html: string; text: string } {
  const subject = "Welcome to AdFlow";
  const signInUrl = `${siteUrl()}/signin`;
  const p = emailStyles.paragraph;
  const steps = [
    "Create a project with your brand and product.",
    "Let AdFlow research the brand and write the ads.",
    "Download the finished gallery.",
  ];

  const html: string[] = [];
  const text: string[] = [subject, ""];

  if (name) {
    html.push(`<p style="${p}">Hi ${escapeHtml(name)},</p>`);
    text.push(`Hi ${name},`, "");
  }

  html.push(
    `<p style="${p}">AdFlow turns a brand name and a website into a folder of finished, on-brand static ads. Your account is ready.</p>`,
  );
  text.push(
    "AdFlow turns a brand name and a website into a folder of finished, on-brand static ads. Your account is ready.",
    "",
  );

  if (planName) {
    html.push(
      `<p style="${p}">You're on the <strong>${escapeHtml(planName)}</strong> plan.</p>`,
    );
    text.push(`You're on the ${planName} plan.`, "");
  }

  html.push(
    `<p style="${p} margin-bottom: 8px;">Getting your first ads takes three steps:</p>`,
    `<ol style="margin: 0 0 16px; padding-left: 22px; font-size: 15px; line-height: 1.6;">`,
    ...steps.map((step) => `<li style="margin: 0 0 4px;">${step}</li>`),
    `</ol>`,
  );
  text.push(
    "Getting your first ads takes three steps:",
    ...steps.map((step, i) => `${i + 1}. ${step}`),
    "",
  );

  if (password) {
    html.push(
      `<div style="${emailStyles.panel}">`,
      `<p style="${p} margin-bottom: 10px; font-weight: 600;">Your sign-in details</p>`,
      `<p style="${p} margin-bottom: 4px;">Email: <span style="${emailStyles.mono}">${escapeHtml(email)}</span></p>`,
      `<p style="${p} margin-bottom: 0;">Temporary password: <span style="${emailStyles.mono}">${escapeHtml(password)}</span></p>`,
      `</div>`,
      `<p style="${p}">After you sign in, change this password under Profile.</p>`,
    );
    text.push(
      "Your sign-in details",
      `Email: ${email}`,
      `Temporary password: ${password}`,
      "",
      "After you sign in, change this password under Profile.",
      "",
    );
  }

  html.push(button(signInUrl, "Sign in to AdFlow"));
  text.push(`Sign in: ${signInUrl}`);

  return {
    subject,
    html: emailLayout({
      title: subject,
      preheader: "Your account is ready. Here's how to get your first ads.",
      bodyHtml: html.join("\n"),
    }),
    text: text.join("\n"),
  };
}

/**
 * Welcome email for a new account. Scheduled right after signup or admin
 * provisioning; never throws, so a failed email can't break either flow.
 * `password` is only passed for admin-created accounts.
 */
export const sendWelcome = internalAction({
  args: { userId: v.id("users"), password: v.optional(v.string()) },
  returns: sendResult,
  handler: async (ctx, args): Promise<SendResult> => {
    try {
      const recipient = await ctx.runQuery(internal.emails.welcomeRecipient, {
        userId: args.userId,
      });
      if (recipient === null) {
        const error = "User not found or has no email address.";
        console.error(`Welcome email for ${args.userId} not sent: ${error}`);
        return { ok: false, error };
      }
      const message = welcomeEmail({ ...recipient, password: args.password });
      const result = await sendEmail({
        to: recipient.email,
        ...message,
        tag: "welcome",
      });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`Welcome email for ${args.userId} not sent: ${error}`);
      return { ok: false, error };
    }
  },
});

/**
 * Sends a short test email to check Postmark delivery end to end:
 *   npx convex run emails:sendTest '{"to": "you@example.com"}'
 */
export const sendTest = internalAction({
  args: { to: v.string() },
  returns: sendResult,
  handler: async (_ctx, args): Promise<SendResult> => {
    const to = args.to.trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) {
      return { ok: false, error: "Pass a valid email address as `to`." };
    }
    const subject = "AdFlow test email";
    const from = fromAddress();
    const site = siteUrl();
    const html = emailLayout({
      title: "Email is working",
      preheader: "A quick check that AdFlow can send email.",
      bodyHtml: [
        `<p style="${emailStyles.paragraph}">If you're reading this, AdFlow can send email through Postmark.</p>`,
        `<p style="${emailStyles.muted}">Sent from ${escapeHtml(from)} for ${escapeHtml(site)}.</p>`,
      ].join("\n"),
    });
    const text = [
      "Email is working",
      "",
      "If you're reading this, AdFlow can send email through Postmark.",
      "",
      `Sent from ${from} for ${site}.`,
    ].join("\n");
    const result = await sendEmail({ to, subject, html, text, tag: "test" });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  },
});
