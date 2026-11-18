import type { Metadata } from "next";
import { TenantLeaseReviewClient } from "@/components/tenant-lease-review-client";

export const metadata: Metadata = {
  title: "Review your lease",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TenantLeaseReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] ?? "" : params.token ?? "";

  return <TenantLeaseReviewClient token={token} />;
}
