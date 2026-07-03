"use client";

import { useQuery } from "convex/react";
import { BadgeCheck, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { AuthSplit } from "@/components/auth/auth-split";
import { SignupForm } from "@/components/auth/signup-form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function SignupTokenPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const link = useQuery(api.signupLinks.validate, { token });

  return (
    <AuthSplit>
      {link === undefined ? (
        <div className="space-y-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !link.valid ? (
        <div className="space-y-4 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
            <LinkIcon className="size-4 text-muted-foreground" />
          </span>
          <h2 className="text-xl font-semibold tracking-tight">
            You need a signup link
          </h2>
          <p className="text-sm text-muted-foreground">
            This signup link is invalid or has been deactivated. AdFlow is
            invite-only — ask the person who runs your account for a fresh
            link.
          </p>
          <p className="text-sm">
            <Link href="/signin" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">
              Create your account
            </h2>
            <Badge variant="secondary" className="gap-1.5">
              <BadgeCheck className="size-3.5 text-primary" />
              {link.planName} plan
            </Badge>
            <p className="text-sm text-muted-foreground">
              You&apos;ve been invited to AdFlow on the {link.planName} plan.
            </p>
          </div>
          <SignupForm signupToken={token} />
          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/signin" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      )}
    </AuthSplit>
  );
}
