import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  Compass,
  FileText,
  MapPin,
  Target,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DashboardPreview,
  LandlordVisual,
  HomeHero,
  PageIntro,
  PrimaryCta,
} from "@/components/marketing";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata: Metadata = {
  title: "Property management, made simpler",
  description:
    "Manage properties, tenants, leases, rent records and maintenance in one place with PropEase.",
};

const featureCards: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    title: "Properties & units",
    description: "Organise property details, unit availability and occupancy.",
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
    description: "Track repair requests and follow progress through to completion.",
    icon: Wrench,
    tone: "blue",
  },
  {
    title: "Team & reporting",
    description: "Coordinate staff and review activity across your portfolio.",
    icon: FileText,
    tone: "mint",
  },
];

const landlordCards = [
  {
    title: "Know your properties",
    description: "See unit details, occupancy and availability in one place.",
    icon: Building2,
    tone: "mint",
  },
  {
    title: "Keep tenancy details close",
    description: "Find tenant information, lease agreements and important dates.",
    icon: FileText,
    tone: "blue",
  },
  {
    title: "Stay on top of rent",
    description: "Record rent and deposits, and keep an eye on outstanding balances.",
    icon: CircleDollarSign,
    tone: "peach",
  },
  {
    title: "Follow property work",
    description: "Document inspections and keep track of maintenance requests.",
    icon: Wrench,
    tone: "lilac",
  },
];

const managerCards = [
  {
    title: "Portfolio overview",
    description: "Review properties, units and occupancy across your portfolio.",
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
    title: "Rent activity",
    description: "Review rent records, payments and balances across properties.",
    icon: CircleDollarSign,
    tone: "peach",
  },
  {
    title: "Maintenance follow-up",
    description: "Assign repair work and follow it through to completion.",
    icon: Wrench,
    tone: "lilac",
  },
];

export default function HomePage() {
  return (
    <div className="home-page">
      <HomeHero />
      <section
        id="about"
        className="section home-about-section"
        aria-labelledby="home-about-title"
      >
        <div className="container">
          <ScrollReveal className="home-about-layout">
            <div className="home-about-copy">
              <span className="eyebrow"><span className="eyebrow-dot" />ABOUT PROPEASE</span>
              <h2 id="home-about-title">A simpler way to manage the places we call home.</h2>
              <p>
                Property management has a lot of moving parts. PropEase brings
                property details, tenant records, leases, rent activity,
                inspections and maintenance into one organised workspace.
              </p>
              <p>
                Built with the Rwandan property market in mind, we aim to make
                everyday operations clearer for landlords, property managers
                and the teams they work with.
              </p>
              <div className="home-about-location"><MapPin size={15} /> Built in Rwanda, for property teams everywhere</div>
              <Link className="text-link" href="/contact">
                Get in touch <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="home-about-visual">
              <DashboardPreview manager />
              <div className="home-about-mission">
                <span className="benefit-icon mint"><Compass size={18} /></span>
                <div>
                  <small>OUR PURPOSE</small>
                  <strong>Make the everyday easier to manage.</strong>
                </div>
                <span className="home-about-mission-mark" aria-hidden="true"><Target size={23} /></span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section
        id="features"
        className="section home-features-section"
        aria-labelledby="home-features-title"
      >
        <div className="container">
          <ScrollReveal className="section-heading">
            <span className="eyebrow"><span className="eyebrow-dot" />FEATURES</span>
            <h2 id="home-features-title">The essentials of property management, together.</h2>
            <p>Bring your properties, people and day-to-day operations into one clear view.</p>
          </ScrollReveal>
          <ScrollReveal className="feature-summary-grid home-feature-grid scroll-reveal-stagger">
            {featureCards.map(({ title, description, icon: Icon, tone }) => (
              <article className="feature-summary-card" key={title}>
                <span className={`benefit-icon ${tone}`}><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </ScrollReveal>
        </div>
      </section>

      <section
        id="landlords"
        className="section home-audience-section home-landlords-section"
        aria-labelledby="home-landlords-title"
      >
        <div className="container">
          <ScrollReveal className="home-audience-layout">
            <div className="home-audience-copy">
              <PageIntro
                centered={false}
                titleLevel="h2"
                eyebrow="FOR LANDLORDS"
                title="Your rental properties, organised."
                description="Manage properties, tenants, leases and rent records from one straightforward workspace."
              />
              <Link href="/register" className="button button-primary">
                Get started <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="home-audience-visual"><LandlordVisual /></div>
          </ScrollReveal>
          <ScrollReveal className="feature-summary-grid home-audience-cards scroll-reveal-stagger">
            {landlordCards.map(({ title, description, icon: Icon, tone }) => (
              <article className="feature-summary-card" key={title}>
                <span className={`benefit-icon ${tone}`}><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </ScrollReveal>
        </div>
      </section>

      <section
        id="managers"
        className="section home-audience-section home-managers-section"
        aria-labelledby="home-managers-title"
      >
        <div className="container">
          <ScrollReveal className="home-audience-layout home-manager-layout">
            <div className="home-audience-copy">
              <PageIntro
                centered={false}
                titleLevel="h2"
                eyebrow="FOR PROPERTY MANAGERS"
                title="Your portfolio and team, connected."
                description="Coordinate property records, rent activity and team workflows in one workspace."
              />
              <Link href="/register" className="button button-primary">
                Get started <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="home-audience-visual home-manager-visual">
              <DashboardPreview manager />
            </div>
          </ScrollReveal>
          <ScrollReveal className="feature-summary-grid home-audience-cards scroll-reveal-stagger">
            {managerCards.map(({ title, description, icon: Icon, tone }) => (
              <article className="feature-summary-card" key={title}>
                <span className={`benefit-icon ${tone}`}><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </ScrollReveal>
        </div>
      </section>

      <div className="container home-cta-reveal">
        <ScrollReveal><PrimaryCta /></ScrollReveal>
      </div>
    </div>
  );
}
