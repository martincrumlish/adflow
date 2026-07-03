import { Search, Sparkles, Images } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

/** Two-column marketing layout for sign-in and signup pages. */
export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border bg-sidebar p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 20% -10%, oklch(0.585 0.175 276.9 / 14%), transparent), radial-gradient(ellipse 60% 40% at 90% 110%, oklch(0.585 0.175 276.9 / 8%), transparent)",
          }}
        />
        <Logo />
        <div className="relative z-10 max-w-md space-y-8">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            From brand URL to a folder of finished ads.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            AdFlow researches your brand, writes image prompts in its real
            voice, and renders production-ready static ads while you do
            something better with your afternoon.
          </p>
          <ul className="space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <Search className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <span className="font-medium">Brand research on autopilot</span>
                <span className="block text-muted-foreground">
                  Real web research distilled into a Brand DNA document.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <span className="font-medium">On-brand prompts, instantly</span>
                <span className="block text-muted-foreground">
                  Twelve proven ad formats filled with your colors, fonts, and
                  voice.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Images className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <span className="font-medium">A gallery, not a queue</span>
                <span className="block text-muted-foreground">
                  Generation runs in the background — come back to finished
                  creative.
                </span>
              </span>
            </li>
          </ul>
        </div>
        <p className="relative z-10 text-xs text-muted-foreground">
          © {new Date().getFullYear()} AdFlow
        </p>
      </div>
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
