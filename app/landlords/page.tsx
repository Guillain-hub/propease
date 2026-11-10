import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  FileText,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LandlordVisual, PageIntro } from "@/components/marketing";

export const metadata: Metadata = {
  title: "For Landlords",
  description:
    "Organise rental properties, tenants, rent records and maintenance with PropEase.",
};

const landlordTools: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    title: "Properties & units",
    description: "See your properties, unit details and occupancy in one place.",
    icon: Building2,
    tone: "mint",
  },
  {
    title: "Tenants & leases",
    description: "Keep tenant details, agreements and important dates together.",
    icon: FileText,
    tone: "blue",
  },
  {
    title: "Rent & deposits",
    description: "Record payments, balances and security deposits.",
    icon: CircleDollarSign,
    tone: "peach",
  },
  {
    title: "Inspections & maintenance",
    description: "Document property condition and follow repairs through.",
    icon: Wrench,
    tone: "lilac",
  },
];

export default function LandlordsPage() {
  return (
    <>
      <section className="audience-hero">
        <div className="container audience-layout">
          <div className="audience-copy">
            <PageIntro
              centered={false}
              eyebrow="FOR LANDLORDS"
              title="Your rental properties, organised."
              description="Manage properties, tenants, leases and rent records from one straightforward workspace."
            />
            <div className="hero-actions">
              <Link
                href="/register"
                className="button button-primary button-large"
              >
                Get started <ArrowUpRight size={17} />
              </Link>
            </div>
          </div>
          <div className="audience-visual">
            <LandlordVisual />
          </div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container feature-summary-grid audience-summary-grid">
          {landlordTools.map(({ title, description, icon: Icon, tone }) => (
            <article className="feature-summary-card" key={title}>
              <span className={`benefit-icon ${tone}`}>
                <Icon size={20} />
              </span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
