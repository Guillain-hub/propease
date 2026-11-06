import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PropEase — Property management, made simpler",
    template: "%s | PropEase",
  },
  description:
    "A simpler way for landlords and property managers in Rwanda to organise properties, tenants, leases, rent records, inspections and maintenance.",
  applicationName: "PropEase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
