import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing";

export const metadata: Metadata = { title: "Terms & Conditions" };

export default function TermsPage() {
  return (
    <section className="section legal-page">
      <div className="container legal-container">
        <PageIntro eyebrow="LEGAL" title="Terms & conditions" description="PropEase service terms will be published before accounts or paid subscriptions become available." />
        <div className="legal-notice"><p>PropEase is preparing the terms that will govern use of the platform. This public website is an informational preview; account creation, paid plans and platform services are not yet connected.</p><p>Final terms will describe the service, account responsibilities, subscription details, acceptable use and other applicable conditions.</p></div>
      </div>
    </section>
  );
}
