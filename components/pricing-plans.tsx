"use client";

import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { useState } from "react";

const plans = [
  { name: "Starter", audience: "For individual landlords", description: "A simpler home for your essential property records.", features: ["Property and unit management", "Tenant records", "Lease management", "Basic rent tracking"], featured: false },
  { name: "Professional", audience: "For growing landlords and managers", description: "More visibility for your growing day-to-day operations.", features: ["Everything in Starter", "Inspection management", "Maintenance management", "Automated reminders", "Financial reports"], featured: true },
  { name: "Business", audience: "For property management companies", description: "Tools to help teams manage a wider portfolio.", features: ["Everything in Professional", "Staff accounts and role management", "Multi-property management", "Advanced organisation controls", "Priority support"], featured: false },
];

export function PricingPlans() {
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  return (
    <>
      <div className="billing-switch" aria-label="Billing period">
        <button type="button" aria-pressed={period === "monthly"} className={period === "monthly" ? "selected" : ""} onClick={() => setPeriod("monthly")}>Monthly</button>
        <button type="button" aria-pressed={period === "yearly"} className={period === "yearly" ? "selected" : ""} onClick={() => setPeriod("yearly")}>Yearly</button>
        <span>Plan prices to be announced</span>
      </div>
      <div className="pricing-grid">
        {plans.map((plan) => (
          <article className={`pricing-card${plan.featured ? " pricing-card-featured" : ""}`} key={plan.name}>
            {plan.featured && <span className="popular-tag">A GOOD FIT FOR GROWING TEAMS</span>}
            <span className="plan-audience">{plan.audience}</span>
            <h2>{plan.name}</h2>
            <p className="plan-description">{plan.description}</p>
            <div className="plan-price">Coming soon<span>Pricing will be confirmed before launch</span></div>
            <Link href="/register" className={plan.featured ? "button button-primary plan-button" : "button button-outline-dark plan-button"}>Get started <ArrowUpRight size={15} /></Link>
            <div className="plan-divider" />
            <span className="plan-includes">WHAT&apos;S INCLUDED</span>
            <ul>{plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
          </article>
        ))}
      </div>
      <p className="billing-disclaimer">You won&apos;t be charged by selecting a plan here. Subscription availability and pricing are not yet confirmed.</p>
    </>
  );
}
