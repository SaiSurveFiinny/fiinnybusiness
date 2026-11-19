import type { Metadata } from "next";

// Post-payment confirmation. Only meaningful right after a checkout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
