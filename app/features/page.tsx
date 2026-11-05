import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  KeyRound,
  Settings2,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageIntro, PrimaryCta } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Features",
  description: "Explore PropEase tools for managing properties, tenants, leases, inspections, rent records and maintenance.",
};

const modules: { title: string; description: string; icon: LucideIcon; features: string[]; tone: string }[] = [
  { title: "Organisation & account management", description: "Set up a workspace that fits the way you manage.", icon: Settings2, tone: "mint", features: ["Account registration and authentication", "Landlord and company profiles", "Staff invitations and roles", "Account settings"] },
  { title: "Property & unit management", description: "Keep property details and individual rental units organised.", icon: Building2, tone: "blue", features: ["Register different property types", "Manage individual rental units", "Track availability and occupancy", "Store property photos and details"] },
  { title: "Tenant management", description: "Keep tenant information and tenancy records in one place.", icon: Users, tone: "peach", features: ["Tenant profiles and contact details", "Unit assignments", "Tenancy history", "Tenant records and documents"] },
  { title: "Lease management", description: "Stay on top of agreements, key dates and renewals.", icon: FileText, tone: "lilac", features: ["Create and manage lease records", "Upload signed agreements", "Generate PDF documents", "Track lease expiry and renewals"] },
  { title: "Inspections", description: "Document property condition at important moments.", icon: ClipboardCheck, tone: "blue", features: ["Move-in and move-out inspections", "Room-by-room checklists", "Damage descriptions and photos", "Inspection reports"] },
  { title: "Rent & deposit management", description: "Maintain a clear record of rent activity and deposits.", icon: CircleDollarSign, tone: "mint", features: ["Monthly rent charges", "Manual payment recording", "Partial payments and outstanding balances", "Security deposit tracking and receipts"] },
  { title: "Maintenance management", description: "Follow requests from initial report to completion.", icon: Wrench, tone: "peach", features: ["Maintenance request submission", "Request approval and assignment", "Progress tracking", "Completion records and costs"] },
  { title: "Utilities & expenses", description: "Keep property costs and utility records together.", icon: Wallet, tone: "lilac", features: ["Electricity, water and other utility charges", "Shared utility allocations", "Property expense records", "Financial reporting"] },
  { title: "Notifications & reminders", description: "Keep upcoming tasks and important dates visible.", icon: Bell, tone: "blue", features: ["Rent due reminders", "Overdue rent notifications", "Lease expiry reminders", "Maintenance updates"] },
  { title: "Tenant portal", description: "Give tenants a clear place to access their information.", icon: KeyRound, tone: "mint", features: ["View leases and payment history", "Access receipts", "Submit maintenance requests", "View shared notices and inspection reports"] },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="page-hero features-hero">
        <div className="container"><PageIntro eyebrow="THE PROP EASE TOOLKIT" title="The details of property management, in one place." description="Practical tools to organise your properties, people and processes from the first lease record to the latest maintenance update." /></div>
      </section>
      <section className="section features-page-section">
        <div className="container">
          <div className="features-intro-row"><p>One workspace for the records and workflows behind well-managed properties.</p><span>10 connected modules <i /></span></div>
          <div className="modules-grid">
            {modules.map(({ title, description, icon: Icon, features, tone }, i) => (
              <article className="module-card" key={title}>
                <div className="module-card-top"><span className={`benefit-icon ${tone}`}><Icon size={21} /></span><span className="module-number">0{i + 1}</span></div>
                <h2>{title}</h2><p>{description}</p>
                <ul>{features.map((feature) => <li key={feature}><span><span /></span>{feature}</li>)}</ul>
              </article>
            ))}
          </div>
          <div className="feature-integrations-note"><span><Bell size={17} /></span><div><b>Designed for real, day-to-day workflows</b><p>Keep records connected and your next steps easy to spot, all in one property management workspace.</p></div><Link href="/contact">Talk to us <ArrowRight size={15} /></Link></div>
        </div>
      </section>
      <div className="container"><PrimaryCta title="Bring your property workflows together." description="Explore a more organised way to manage properties, tenants and day-to-day work." /></div>
    </>
  );
}
