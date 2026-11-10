import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageIntro } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Manage properties, tenants, leases, rent, maintenance and reporting with PropEase.",
};

const features: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    title: "Properties & units",
    description: "Organise properties, units, occupancy and availability.",
    icon: Building2,
    tone: "mint",
  },
  {
    title: "Tenants & leases",
    description: "Keep tenant records, agreements and key dates together.",
    icon: Users,
    tone: "blue",
  },
  {
    title: "Rent & deposits",
    description: "Record rent, payments, balances and security deposits.",
    icon: CircleDollarSign,
    tone: "peach",
  },
  {
    title: "Inspections & documents",
    description: "Save inspection details, photos and property documents.",
    icon: ClipboardCheck,
    tone: "lilac",
  },
  {
    title: "Maintenance",
    description: "Track repair requests, progress and completion.",
    icon: Wrench,
    tone: "blue",
  },
  {
    title: "Team & reporting",
    description: "Coordinate staff and review portfolio activity.",
    icon: FileText,
    tone: "mint",
  },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="page-hero features-hero">
        <div className="container">
          <PageIntro
            eyebrow="FEATURES"
            title="The essentials of property management, together."
            description="Manage properties, tenants, rent records and everyday tasks from one workspace."
          />
        </div>
      </section>
      <section className="section feature-summary-section">
        <div className="container feature-summary-grid">
          {features.map(({ title, description, icon: Icon, tone }) => (
            <article className="feature-summary-card" key={title}>
              <span className={`benefit-icon ${tone}`}>
                <Icon size={20} />
              </span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="feature-summary-action">
          <Link className="button button-primary" href="/register">
            Get started
          </Link>
        </div>
      </section>
    </>
  );
}
