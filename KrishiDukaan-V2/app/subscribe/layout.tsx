import type { Metadata } from "next";

// A redirect hop for referral share links (?ref=CODE), not a page with content of its own.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
