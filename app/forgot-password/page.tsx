"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = (
      new FormData(event.currentTarget).get("email") as string
    )
      .trim()
      .toLowerCase();
    setPending(true);
    try {
      await signIn("password", { email, flow: "reset" });
    } catch {
      // Don't reveal whether the account exists.
    }
    setSentTo(email);
    setPending(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Logo />
      <Card className="w-full max-w-sm">
        {sentTo ? (
          <>
            <CardHeader className="text-center">
              <MailCheck className="mx-auto mb-2 size-8 text-primary" />
              <CardTitle>Check your email</CardTitle>
              <CardDescription>
                If an account exists for {sentTo}, we sent it a reset code.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full">
                <Link
                  href={`/reset-password?email=${encodeURIComponent(sentTo)}`}
                >
                  Enter reset code
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                <Link href="/signin" className="hover:text-foreground">
                  Back to sign in
                </Link>
              </p>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Forgot your password?</CardTitle>
              <CardDescription>
                Enter your email and we&apos;ll send you a reset code.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  Send reset code
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  <Link href="/signin" className="hover:text-foreground">
                    Back to sign in
                  </Link>
                </p>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
