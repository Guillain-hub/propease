import type { Metadata } from "next";
import {
  DashboardPreview,
  HomeBenefits,
  HomeFeaturePreview,
  HomeHero,
  HomeHowItWorks,
  PrimaryCta,
  TrustStrip,
} from "@/components/marketing";

export const metadata: Metadata = {
  title: "Property management, made simpler",
  description:
    "Manage properties, tenants, leases, rent records and maintenance in one place with PropEase.",
};

export default function HomePage() {
  return (
    <div className="home-page">
      <HomeHero />
      <section className="section product-section who-we-are" aria-labelledby="who-we-are-title">
        <div className="container">
          <div className="product-layout who-we-are-layout">
            <div className="product-copy who-we-are-copy">
              <span className="eyebrow"><span className="eyebrow-dot" />WHO WE ARE</span>
              <h2 id="who-we-are-title">One easy system for every part of rental management.</h2>
              <p>PropEase is a self-service property management platform that helps landlords and property management companies manage rental properties, tenants, lease agreements, inspections, rent records, security deposits, utilities, maintenance and notices from one central account.</p>
            </div>
            <div className="product-dashboard who-we-are-dashboard">
              <DashboardPreview manager />
            </div>
          </div>
          <div className="capabilities-panel">
            <div className="capabilities-heading">
              <span>MADE FOR</span>
            </div>
            <ul className="capabilities-list" aria-label="Who PropEase is made for">
              <li>Landlords</li>
              <li>Property management companies</li>
            </ul>
          </div>
        </div>
      </section>
      <TrustStrip />
      <HomeBenefits />
      <HomeHowItWorks />
      <HomeFeaturePreview />
      <div className="container"><PrimaryCta /></div>
    </div>
  );
}
