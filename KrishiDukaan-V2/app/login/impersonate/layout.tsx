import type { Metadata } from "next";

// Admin-only impersonation hand-off. Not a page anyone should land on from search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
