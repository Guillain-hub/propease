"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const isWorkspace = usePathname().startsWith("/dashboard");

  return (
    <>
      {!isWorkspace && <SiteHeader />}
      <main className={isWorkspace ? "dashboard-site-main" : "site-main"}>
        {children}
      </main>
      {!isWorkspace && <SiteFooter />}
    </>
  );
}
