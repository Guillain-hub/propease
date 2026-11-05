import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BarChart3, Check, CircleDollarSign, ClipboardCheck, FileText, Users, Wrench } from "lucide-react";
import { DashboardPreview, PageIntro, PrimaryCta } from "@/components/marketing";

export const metadata: Metadata = {
  title: "For Property Managers",
  description: "Coordinate properties, owners, tenants, staff, rent records and maintenance with PropEase.",
};

const managerBenefits = [
  [BarChart3, "See across your portfolio", "Keep multiple properties and owners in a connected workspace and find the information you need faster."],
  [FileText, "Organise tenant agreements", "Keep tenant records, unit assignments and lease details together."],
  [Users, "Give your team clear roles", "Invite staff and organise responsibilities with account roles."],
  [CircleDollarSign, "Follow rent and arrears", "Keep a record of charges and payments, and see which balances need follow-up."],
  [ClipboardCheck, "Track inspections", "Document property checks and keep inspection notes and reports accessible."],
  [Wrench, "Coordinate maintenance", "Follow maintenance requests, assignments and completion records."],
] as const;

export default function PropertyManagersPage() {
  return (
    <>
      <section className="audience-hero manager-hero">
        <div className="container audience-layout manager-layout">
          <div className="audience-copy"><PageIntro centered={false} eyebrow="FOR PROPERTY MANAGERS" title="Run a more connected property operation." description="Bring properties, owners, tenants and team workflows together, with a clearer view of the records and tasks that keep your portfolio moving." /><div className="hero-actions"><Link href="/register" className="button button-primary button-large">Simplify property management <ArrowUpRight size={17} /></Link></div><div className="audience-proof"><Check size={15} />Designed to support your team's property workflows</div></div>
          <div className="manager-visual"><DashboardPreview manager /></div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container">
          <div className="section-heading"><span className="eyebrow"><span className="eyebrow-dot" />BUILT FOR THE BIGGER PICTURE</span><h2>More visibility for every<br className="desktop-break" /> moving part.</h2><p>PropEase helps professional teams stay connected to the operational details across properties and people.</p></div>
          <div className="landlord-benefit-grid">{managerBenefits.map(([Icon, title, text], i) => <article className="landlord-benefit-card" key={title}><span className="benefit-icon blue"><Icon size={20} /></span><span className="module-number">0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </div>
      </section>
      <section className="section manager-operations">
        <div className="container manager-operations-layout">
          <div><span className="eyebrow"><span className="eyebrow-dot" />ACCOUNTABILITY BY DESIGN</span><h2>Clear records.<br />Clear responsibilities.</h2><p>Organise staff roles, rent records, inspections and maintenance activity so your team can stay aligned and make follow-up easier.</p><Link className="text-link" href="/features">Explore team features <ArrowRight size={16} /></Link></div>
          <div className="operations-card"><div className="operations-card-header"><span>TEAM ACTIVITY</span><span className="activity-live"><i /> WORKSPACE</span></div><div className="operations-row"><span className="operations-avatar avatar-green">JM</span><div><b>Inspection recorded</b><small>Jean M. · Kacyiru property</small></div><span>Today</span></div><div className="operations-row"><span className="operations-avatar avatar-blue">AK</span><div><b>Rent payment noted</b><small>Alex K. · Unit 3B, Kimihurura</small></div><span>Today</span></div><div className="operations-row"><span className="operations-avatar avatar-amber">CN</span><div><b>Maintenance assigned</b><small>Chantal N. · Remera property</small></div><span>Yesterday</span></div><div className="operations-summary"><span><ClipboardCheck size={16} /> RECORDS KEPT CONNECTED</span><span><Wrench size={16} /> WORKFLOWS MADE VISIBLE</span></div></div>
        </div>
      </section>
      <div className="container"><PrimaryCta title="Make property management feel more connected." description="See how PropEase can bring your portfolio, team and day-to-day workflows into one place." buttonLabel="Simplify property management" /></div>
    </>
  );
}
