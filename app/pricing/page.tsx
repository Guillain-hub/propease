import type { Metadata } from "next";
import { Check, HelpCircle } from "lucide-react";
import { PageIntro, PrimaryCta } from "@/components/marketing";
import { PricingPlans } from "@/components/pricing-plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Explore PropEase plans for individual landlords, growing property managers and property management companies.",
};

const faqs = [
  ["When will plan prices be available?", "We are still finalising subscription pricing. We will share confirmed plans before subscriptions are available."],
  ["Can I change plans later?", "Plan details are being finalised. Contact us if you would like to discuss how PropEase could fit your property portfolio."],
  ["Is there a separate plan for a property management company?", "The Business plan is designed with property management companies and staff workflows in mind. Its final inclusions and pricing will be confirmed before launch."],
  ["Does PropEase process rent payments?", "PropEase is a property management platform. Rent records can be maintained in the platform, but online rent payment and bank integrations are not offered here."],
];

export default function PricingPage() {
  return (
    <>
      <section className="page-hero pricing-hero">
        <div className="container">
          <PageIntro eyebrow="PLANS THAT FIT YOUR WORK" title="The right tools for your next step." description="Whether you manage one home or a growing portfolio, find the PropEase plan shaped around your work." />
          <div className="pricing-release-note"><span><Check size={15} /></span>Plan prices are coming soon. No prices have been set yet.</div>
          <PricingPlans />
        </div>
      </section>
      <section className="section">
        <div className="container comparison-section">
          <div className="section-heading"><span className="eyebrow"><span className="eyebrow-dot" />COMPARE PLANS</span><h2>See what&apos;s included.</h2><p>Plan details remain subject to confirmation before launch.</p></div>
          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead><tr><th>Included features</th><th>Starter</th><th>Professional</th><th>Business</th></tr></thead>
              <tbody>
                {[
                  ["Properties & rental units", true, true, true],
                  ["Tenant and lease records", true, true, true],
                  ["Basic rent tracking", true, true, true],
                  ["Inspections & maintenance", false, true, true],
                  ["Reminders & financial reports", false, true, true],
                  ["Staff accounts & role management", false, false, true],
                  ["Advanced organisation controls", false, false, true],
                ].map(([label, ...values]) => (
                  <tr key={String(label)}><td>{label}</td>{values.map((enabled, index) => <td key={index}>{enabled ? <Check className="comparison-check" size={17} /> : <span className="comparison-dash">—</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container faq-layout">
          <div className="faq-intro"><span className="eyebrow"><span className="eyebrow-dot" />GOOD TO KNOW</span><h2>Questions about<br />pricing?</h2><p>Here&apos;s what we can tell you while our plans are being finalised.</p></div>
          <div className="faq-list">{faqs.map(([question, answer]) => <details className="faq-item" key={question}><summary>{question}<HelpCircle size={17} /></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>
      <div className="container"><PrimaryCta title="Not sure which plan fits?" description="Tell us what you manage and we can share more as PropEase plans take shape." buttonLabel="Contact us" /></div>
    </>
  );
}
