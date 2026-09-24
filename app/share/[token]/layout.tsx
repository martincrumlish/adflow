import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review",
  // Review links are private by nature; keep them out of search results.
  robots: { index: false, follow: false },
};

export default function ShareLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
