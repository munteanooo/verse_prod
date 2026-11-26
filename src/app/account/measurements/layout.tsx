import type { ReactNode } from "react";
import { PublicShell } from "@/components/layout/public-shell";

export const metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <PublicShell>
      <section className="wrap grid max-w-3xl gap-5 py-12">{children}</section>
    </PublicShell>
  );
}
