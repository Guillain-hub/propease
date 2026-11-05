import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Building2, Check, CircleDollarSign, ClipboardCheck, FileText, KeyRound, Wrench } from "lucide-react";
import { LandlordVisual, PageIntro, PrimaryCta } from "@/components/marketing";

export const metadata: Metadata = {
  title: "For Landlords",
  description: "Manage rental properties, tenants, agreements, rent records and maintenance with PropEase.",
};

const landlordBenefits = [
  [Building2, "Manage multiple properties", "Keep your properties and rental units clearly organised, with occupancy and availability easy to check."],
  [KeyRound, "Know your tenants", "Keep tenant details and tenancy records close to the units they belong to."],
  [FileText, "Keep lease details together", "Store key agreement information and signed documents, and keep an eye on renewal dates."],
  [CircleDollarSign, "Track rent and deposits", "Record rent charges and payments, follow outstanding balances, and keep deposits on file."],
  [ClipboardCheck, "Document property condition", "Record move-in and move-out checks with notes, room lists and photos."],
  [Wrench, "Stay on top of maintenance", "Capture reported issues and follow requests through to completion."],
] as const;

export default function LandlordsPage() {
  return (
    <>
      <section className="audience-hero">
        <div className="container audience-layout">
          <div className="audience-copy"><PageIntro centered={false} eyebrow="FOR LANDLORDS" title="Less time searching. More time in control." description="Your properties, tenants, agreements and rent records — organised in one place that helps you stay on top of the details." /><div className="hero-actions"><Link href="/register" className="button button-primary button-large">Start managing your properties <ArrowUpRight size={17} /></Link></div><div className="audience-proof"><Check size={15} />Made for landlords managing properties in Rwanda</div></div>
          <div className="audience-visual"><LandlordVisual /></div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container">
          <div className="section-heading"><span className="eyebrow"><span className="eyebrow-dot" />YOUR PROPERTIES, YOUR WAY</span><h2>The right details,<br className="desktop-break" /> close at hand.</h2><p>PropEase helps bring the everyday parts of managing a rental property into one organised view.</p></div>
          <div className="landlord-benefit-grid">{landlordBenefits.map(([Icon, title, text], i) => <article className="landlord-benefit-card" key={title}><span className="benefit-icon mint"><Icon size={20} /></span><span className="module-number">0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </div>
      </section>
      <section className="section">
        <div className="container landlord-workflow">
          <div><span className="eyebrow"><span className="eyebrow-dot" />A MORE ORGANISED ROUTINE</span><h2>Spend less energy<br />keeping track of things.</h2><p>With property, tenant and rent records connected, you can get a clearer picture of what needs your attention and keep your records in good order.</p><Link className="text-link" href="/features">See the features <ArrowRight size={16} /></Link></div>
          <div className="workflow-note-card"><div className="workflow-note-top"><span className="benefit-icon peach"><CircleDollarSign size={18} /></span><div><b>Rent record updated</b><small>Today · Unit 3B, Kimihurura</small></div><Check size={16} /></div><div className="workflow-note-line" /><div className="workflow-note-top"><span className="benefit-icon blue"><FileText size={18} /></span><div><b>Lease renewal coming up</b><small>Unit 2A · Review by 18 May</small></div><ArrowRight size={15} /></div><div className="workflow-note-line" /><div className="workflow-note-top"><span className="benefit-icon lilac"><Wrench size={18} /></span><div><b>Maintenance request in progress</b><small>Unit 1C · Status updated</small></div><ArrowRight size={15} /></div></div>
        </div>
      </section>
      <div className="container"><PrimaryCta title="Your properties, more organised." description="Bring your rental records together and build a clearer picture of your properties." buttonLabel="Start managing your properties" /></div>
    </>
  );
}
