"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  CreditCard,
  LayoutTemplate,
  Link2,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    href: "/admin",
    label: "Users",
    icon: Users,
    description: "Accounts, plans, and roles.",
  },
  {
    href: "/admin/plans",
    label: "Plans",
    icon: CreditCard,
    description: "Plans tag accounts — they don't gate features yet.",
  },
  {
    href: "/admin/links",
    label: "Signup links",
    icon: Link2,
    description: "Reusable, non-expiring links that grant access.",
  },
  {
    href: "/admin/templates",
    label: "System templates",
    icon: LayoutTemplate,
    description: "The shared ad-format library every user sees.",
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
    description: "The AI models behind research, copywriting, and rendering.",
  },
];

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = useQuery(api.users.viewer);
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();

  // Client-side redirect for non-admins; the real enforcement is that
  // every admin query/mutation requires the admin role server-side.
  useEffect(() => {
    if (viewer !== undefined && !viewer?.isAdmin) {
      router.replace("/dashboard");
    }
  }, [viewer, router]);

  if (viewer === undefined) {
    return (
      <div className="flex h-screen w-full overflow-hidden">
        <div className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar p-4">
          <Skeleton className="mb-6 h-6 w-28" />
          <Skeleton className="mb-2 h-7 w-full" />
          <Skeleton className="mb-2 h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }
  if (!viewer?.isAdmin) return null;

  const section = SECTIONS.find((s) =>
    s.href === "/admin" ? pathname === "/admin" : pathname.startsWith(s.href),
  );

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 p-4 pb-3">
          <Link href="/admin">
            <Logo />
          </Link>
          <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px]">
            admin
          </Badge>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {SECTIONS.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to app
          </Link>
          <div className="flex items-center justify-between gap-2 px-2">
            <p className="truncate text-xs font-medium">{viewer.email}</p>
            <div className="flex shrink-0 items-center gap-0.5">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                title="Sign out"
                onClick={() =>
                  void signOut().then(() => router.push("/signin"))
                }
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <div className="mb-6">
            <h1 className="text-lg font-semibold tracking-tight">
              {section?.label ?? "Admin"}
            </h1>
            {section?.description && (
              <p className="text-sm text-muted-foreground">
                {section.description}
              </p>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
