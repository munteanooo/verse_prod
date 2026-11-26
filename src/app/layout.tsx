import type { ReactNode } from "react";
import { application } from "@/config/application";
import { defaultLocale } from "@/i18n";
import "./globals.css";

export const metadata = application.metadata;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
