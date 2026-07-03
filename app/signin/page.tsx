"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AuthSplit } from "@/components/auth/auth-split";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    try {
      await signIn("password", {
        email: (formData.get("email") as string).trim().toLowerCase(),
        password: formData.get("password") as string,
        flow: "signIn",
      });
      router.push("/dashboard");
    } catch {
      toast.error("Invalid email or password.");
      setPending(false);
    }
  }

  return (
    <AuthSplit>
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="text-sm text-muted-foreground">
            Welcome back. Enter your details to continue.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Sign in
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          No account? AdFlow is invite-only — ask us for a signup link.
        </p>
      </div>
    </AuthSplit>
  );
}
