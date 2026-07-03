import Resend from "@auth/core/providers/resend";
import { Resend as ResendAPI } from "resend";

function fromAddress(): string {
  const configured = process.env.AUTH_EMAIL_FROM ?? "AdFlow";
  // Allow either a bare display name ("AdFlow") or a full address
  // ("AdFlow <hello@example.com>").
  return configured.includes("<")
    ? configured
    : `${configured} <onboarding@resend.dev>`;
}

export const ResendOTPPasswordReset = Resend({
  id: "resend-otp",
  apiKey: process.env.RESEND_API_KEY,
  async generateVerificationToken() {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] % 100000000;
    return random.toString().padStart(8, "0");
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
    const resetUrl = `${siteUrl}/reset-password?email=${encodeURIComponent(email)}`;
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: [email],
      subject: "Reset your AdFlow password",
      html: [
        `<div style="font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">`,
        `<h2 style="margin: 0 0 16px;">Reset your AdFlow password</h2>`,
        `<p>Use this code to reset your password:</p>`,
        `<p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">${token}</p>`,
        `<p><a href="${resetUrl}">Enter it here</a> along with your new password.</p>`,
        `<p style="color: #666; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>`,
        `</div>`,
      ].join(""),
    });
    if (error) {
      throw new Error(`Could not send password reset email: ${error.message}`);
    }
  },
});
