import type { Metadata } from "next";
import { TenantLeaseTerminationReviewClient } from "@/components/tenant-lease-termination-review-client";

export const metadata: Metadata = {
  title: "Review lease termination",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TenantLeaseTerminationReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] ?? "" : params.token ?? "";

  return <TenantLeaseTerminationReviewClient token={token} />;
}
