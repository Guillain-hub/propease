import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DashboardPreview, PageIntro } from "@/components/marketing";

export const metadata: Metadata = {
  title: "For Property Managers",
  description:
    "Coordinate property portfolios, teams, rent records and maintenance with PropEase.",
};

const managerTools: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    title: "Portfolio overview",
    description: "See properties, units and occupancy across your portfolio.",
    icon: BarChart3,
    tone: "mint",
  },
  {
    title: "Team coordination",
    description: "Give staff workspace access and organise responsibilities.",
    icon: Users,
    tone: "blue",
  },
  {
    title: "Rent records",
    description: "Review rent activity, payments and outstanding balances.",
    icon: CircleDollarSign,
    tone: "peach",
  },
  {
    title: "Maintenance",
    description: "Assign repair work and follow progress to completion.",
    icon: Wrench,
    tone: "lilac",
  },
];

export default function PropertyManagersPage() {
  return (
    <>
      <section className="audience-hero manager-hero">
        <div className="container audience-layout manager-layout">
          <div className="audience-copy">
            <PageIntro
              centered={false}
              eyebrow="FOR PROPERTY MANAGERS"
              title="Your portfolio and team, connected."
              description="Coordinate property records, rent activity and team workflows in one workspace."
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
          <div className="manager-visual">
            <DashboardPreview manager />
          </div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container feature-summary-grid audience-summary-grid">
          {managerTools.map(({ title, description, icon: Icon, tone }) => (
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
