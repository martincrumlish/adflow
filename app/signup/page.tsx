"use client";

import { LinkIcon, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuthSplit } from "@/components/auth/auth-split";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  const [showAdminForm, setShowAdminForm] = useState(false);

  return (
    <AuthSplit>
      <div className="space-y-4 text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
          <LinkIcon className="size-4 text-muted-foreground" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">
          You need a signup link
        </h2>
        <p className="text-sm text-muted-foreground">
          AdFlow is invite-only. Accounts are created through plan-specific
          signup links — ask the person who runs your account for one.
        </p>
        <p className="text-sm">
          <Link href="/signin" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
        <div className="pt-4">
          {showAdminForm ? (
            <div className="space-y-4 rounded-lg border border-border p-4 text-left">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                Admin bootstrap — only emails on the admin allowlist can sign
                up here.
              </p>
              <SignupForm />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdminForm(true)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Administrator with an allowlisted email?
            </button>
          )}
        </div>
      </div>
    </AuthSplit>
  );
}
