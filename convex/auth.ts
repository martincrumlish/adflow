import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel";
import type { DatabaseWriter } from "./_generated/server";
import { adminEmails } from "./lib/access";
import { ResendOTPPasswordReset } from "./passwordReset";

/**
 * Extra fields smuggled through the profile into `createOrUpdateUser`.
 * `signupToken` comes from the public signup form. `adminProvisioned`
 * can only originate from our own `createAccount` call in an admin
 * action; the Password `profile()` below never passes it through.
 */
type SignupProfile = {
  email?: string;
  signupToken?: string;
  adminProvisioned?: boolean;
  role?: "admin" | "user";
  planId?: Id<"plans">;
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile(params) {
        return {
          email: params.email as string,
          signupToken: params.signupToken,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      },
      reset: ResendOTPPasswordReset,
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      }
      // The library types ctx generically; our schema is the real one.
      const db = ctx.db as unknown as DatabaseWriter;
      const profile = args.profile as SignupProfile;
      const email = profile.email?.trim().toLowerCase();
      if (!email) {
        throw new ConvexError("An email address is required.");
      }

      // Accounts provisioned by an admin from the admin area.
      if (profile.adminProvisioned === true) {
        return await db.insert("users", {
          email,
          role: profile.role ?? "user",
          planId: profile.planId,
        });
      }

      // Bootstrap: emails on the ADMIN_EMAILS list may sign up without
      // a link, so the first admin can get in.
      if (adminEmails().includes(email)) {
        return await db.insert("users", { email, role: "admin" });
      }

      // Everyone else needs an active signup link.
      const token = profile.signupToken;
      if (!token) {
        throw new ConvexError(
          "Signing up requires a signup link. Ask for one.",
        );
      }
      const link = await db.query("signupLinks")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();
      if (!link || !link.active) {
        throw new ConvexError(
          "This signup link is invalid or has been deactivated.",
        );
      }
      return await db.insert("users", {
        email,
        role: "user",
        planId: link.planId,
      });
    },
  },
});
