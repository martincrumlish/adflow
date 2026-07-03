"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/admin", label: "Users" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/links", label: "Signup links" },
  { href: "/admin/templates", label: "System templates" },
];

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = useQuery(api.users.viewer);
  const pathname = usePathname();
  const router = useRouter();

  // Client-side redirect for non-admins; the real enforcement is that
  // every admin query/mutation requires the admin role server-side.
  useEffect(() => {
    if (viewer !== undefined && !viewer?.isAdmin) {
      router.replace("/dashboard");
    }
  }, [viewer, router]);

  if (viewer === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-8">
        <Skeleton className="mb-6 h-8 w-40" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (!viewer?.isAdmin) return null;

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-5">
        <h1 className="text-lg font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage accounts, plans, and the signup links that grant access.
        </p>
      </div>
      <nav className="mb-6 flex items-center gap-1 border-b border-border">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
              pathname === section.href
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {section.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
