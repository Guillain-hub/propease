import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const plans = [
  { name: "Free trial", activeUnits: "Up to 3", price: "14 days", priceNote: "Free trial", description: "Try PropEase for 14 days with up to 3 active rental units.", featured: false, href: "/register", action: "Start free trial" },
  { name: "Starter", activeUnits: "Up to 3", price: "RWF 5,000", priceNote: "Proposed monthly price", description: "For portfolios with up to 3 active rental units.", featured: false, href: "/register", action: "Get started" },
  { name: "Professional", activeUnits: "Up to 15", price: "RWF 15,000", priceNote: "Proposed monthly price", description: "For portfolios with up to 15 active rental units.", featured: true, href: "/register", action: "Get started" },
  { name: "Business", activeUnits: "Up to 50", price: "RWF 35,000", priceNote: "Proposed monthly price", description: "For portfolios with up to 50 active rental units.", featured: false, href: "/register", action: "Get started" },
  { name: "Enterprise", activeUnits: "51+", price: "Custom", priceNote: "Proposed monthly price", description: "Custom pricing for portfolios with 51 or more active rental units.", featured: false, href: "/contact", action: "Contact us" },
];

export function PricingPlans() {
  return (
    <>
      <div className="pricing-grid">
        {plans.map((plan) => (
          <article className={`pricing-card${plan.featured ? " pricing-card-featured" : ""}`} key={plan.name}>
            {plan.featured && <span className="popular-tag">PROPOSED PLAN</span>}
            <h2>{plan.name}</h2>
            <p className="plan-description">{plan.description}</p>
            <div className="plan-detail">
              <span>Active rental units</span>
              <strong>{plan.activeUnits}</strong>
            </div>
            <div className="plan-price">{plan.price}<span>{plan.priceNote}</span></div>
            <Link href={plan.href} className={plan.featured ? "button button-primary plan-button" : "button button-outline-dark plan-button"}>{plan.action} <ArrowUpRight size={15} /></Link>
          </article>
        ))}
      </div>
      <p className="billing-disclaimer">Prices are proposed monthly amounts. Final pricing and plan availability will be confirmed before subscriptions launch.</p>
    </>
  );
}
