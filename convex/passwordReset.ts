import Resend from "@auth/core/providers/resend";
import {
  button,
  emailLayout,
  emailStyles,
  escapeHtml,
  sendEmail,
  siteUrl,
} from "./lib/email";

export const ResendOTPPasswordReset = Resend({
  id: "resend-otp",
  apiKey: process.env.RESEND_API_KEY,
  async generateVerificationToken() {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] % 100000000;
    return random.toString().padStart(8, "0");
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const resetUrl = `${siteUrl()}/reset-password?email=${encodeURIComponent(email)}`;
    const subject = "Reset your AdFlow password";

    const html = emailLayout({
      title: subject,
      preheader: `Your reset code is ${token}.`,
      bodyHtml: [
        `<p style="${emailStyles.paragraph}">We got a request to reset the password for your AdFlow account. Here is your reset code:</p>`,
        `<div style="${emailStyles.panel} text-align: center;">`,
        `<span style="${emailStyles.mono} font-size: 30px; font-weight: 700; letter-spacing: 6px;">${escapeHtml(token)}</span>`,
        `</div>`,
        `<p style="${emailStyles.paragraph}">Enter it on the reset page along with your new password. The code works for 24 hours.</p>`,
        button(resetUrl, "Choose a new password"),
        `<p style="${emailStyles.muted}">If you didn't ask to reset your password, you can ignore this email. Your password stays the same.</p>`,
      ].join("\n"),
    });

    const text = [
      "Reset your AdFlow password",
      "",
      "We got a request to reset the password for your AdFlow account.",
      "",
      `Your reset code: ${token}`,
      "",
      `Enter it along with your new password at ${resetUrl}`,
      "The code works for 24 hours.",
      "",
      "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    ].join("\n");

    const result = await sendEmail({ to: email, subject, html, text });
    // Convex Auth surfaces this to the forgot-password form.
    if (!result.ok) {
      throw new Error(`Could not send password reset email: ${result.error}`);
    }
  },
});
