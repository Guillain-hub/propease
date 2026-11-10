import type { Metadata } from "next";
import { SectionEyebrow } from "@/components/marketing";
import { ContactSection } from "@/components/contact-section";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the PropEase team in Kigali, Rwanda.",
};

export default function ContactPage() {
  return (
    <>
      <section className="page-hero contact-hero">
        <div className="container">
          <SectionEyebrow>LET&apos;S TALK</SectionEyebrow>
        </div>
      </section>
      <ContactSection />
    </>
  );
}
