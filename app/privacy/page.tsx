import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <section className="section legal-page">
      <div className="container legal-container">
        <PageIntro eyebrow="LEGAL" title="Privacy policy" description="Privacy information for PropEase will be published before account registration and platform services become available." />
        <div className="legal-notice"><p>PropEase is preparing its privacy documentation. This public website includes preview forms that do not send or store submissions. Do not enter sensitive personal or property information into these forms.</p><p>Before launching account registration, PropEase will publish details about what information the platform collects, how it is used, how it is protected and how users can exercise their rights.</p></div>
      </div>
    </section>
  );
}
