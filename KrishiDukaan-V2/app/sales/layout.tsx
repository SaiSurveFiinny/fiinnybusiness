import type { Metadata } from "next";
import SalesShell from "./sales-shell";

// The field-team portal is behind a role check, but its shell still renders at
// 200 to anyone, so without this Google indexes the sign-in screen as a page.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return <SalesShell>{children}</SalesShell>;
}
