import type { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import { PageIntro, PrimaryCta } from "@/components/marketing";
import { PricingPlans } from "@/components/pricing-plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Explore PropEase plans for individual landlords, growing property managers and property management companies.",
};

const faqs = [
  ["How long is the free trial?", "The free trial lasts 14 days and includes up to 3 active rental units."],
  ["Are these final subscription prices?", "The monthly prices shown are proposed prices. Final pricing and plan availability will be confirmed before subscriptions launch."],
  ["How is Enterprise pricing determined?", "The Enterprise plan is for portfolios with 51 or more active rental units, with custom proposed monthly pricing. Contact us to discuss your portfolio."],
  ["Does PropEase process rent payments?", "PropEase is a property management platform. Rent records can be maintained in the platform, but online rent payment and bank integrations are not offered here."],
];

export default function PricingPage() {
  return (
    <>
      <section className="page-hero pricing-hero">
        <div className="container">
          <PageIntro eyebrow="PRICING" title="Straightforward plans for every portfolio." description="Choose a plan based on the number of active rental units you manage." />
          <PricingPlans />
        </div>
      </section>
      <section className="section section-soft">
        <div className="container faq-layout">
          <div className="faq-intro"><span className="eyebrow"><span className="eyebrow-dot" />GOOD TO KNOW</span><h2>Questions about<br />pricing?</h2><p>Here are a few details about the proposed PropEase plans.</p></div>
          <div className="faq-list">{faqs.map(([question, answer]) => <details className="faq-item" key={question}><summary>{question}<HelpCircle size={17} /></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>
      <div className="container"><PrimaryCta title="Need a plan for a larger portfolio?" description="Contact us about custom proposed pricing for portfolios with 51 or more active rental units." buttonLabel="Contact us" href="/contact" /></div>
    </>
  );
}
