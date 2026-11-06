import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  KeyRound,
  LayoutDashboard,
  Plus,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow"><span className="eyebrow-dot" />{children}</span>;
}

export function PageIntro({
  eyebrow,
  title,
  description,
  centered = true,
}: {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
}) {
  return (
    <div className={`page-intro${centered ? " page-intro-centered" : ""}`}>
      <SectionEyebrow>{eyebrow}</SectionEyebrow>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export function DashboardPreview({ manager = false }: { manager?: boolean }) {
  const stats = manager
    ? [
        ["Properties", "24", "+2 this month"],
        ["Units occupied", "86%", "Across all properties"],
        ["Rent to follow up", "8", "Needs attention"],
      ]
    : [
        ["My properties", "04", "Across Kigali"],
        ["Occupied units", "12 / 15", "3 available"],
        ["Rent to follow up", "2", "This month"],
      ];

  return (
    <div className="dashboard-frame" aria-label={manager ? "Example property management company dashboard" : "Example landlord dashboard"}>
      <div className="dashboard-window-bar">
        <div className="window-dots"><i /><i /><i /></div>
        <div className="dashboard-address"><span /> app.propease.rw / dashboard</div>
        <div className="window-avatar">A</div>
      </div>
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="mini-brand">
            <Image src="/images/new logo.png" alt="PropEase" width={400} height={133} />
          </div>
          <div className="sidebar-label">WORKSPACE</div>
          <div className="sidebar-item selected"><LayoutDashboard size={15} /> Overview</div>
          <div className="sidebar-item"><Building2 size={15} /> Properties</div>
          <div className="sidebar-item"><KeyRound size={15} /> Tenants</div>
          <div className="sidebar-item"><FileText size={15} /> Leases</div>
          <div className="sidebar-item"><CircleDollarSign size={15} /> Rent records</div>
          <div className="sidebar-item"><ClipboardCheck size={15} /> Inspections</div>
          <div className="sidebar-item"><Wrench size={15} /> Maintenance</div>
          <div className="sidebar-help"><span>Need a hand?</span><b>Visit help centre <ArrowUpRight size={12} /></b></div>
        </aside>
        <div className="dashboard-content">
          <div className="dashboard-topline">
            <div>
              <span className="dashboard-date">MONDAY, 12 MAY 2025</span>
              <h3>Good morning, Alex <span>✦</span></h3>
              <p>Here&apos;s what&apos;s happening with your properties.</p>
            </div>
            <button type="button" className="dashboard-add"><Plus size={14} /> Add property</button>
          </div>
          <div className="dashboard-stats">
            {stats.map(([label, value, note], index) => (
              <div className="dashboard-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small className={index === 2 ? "stat-note attention" : "stat-note"}>
                  {index === 2 && <span className="attention-dot" />}{note}
                </small>
              </div>
            ))}
          </div>
          <div className="dashboard-lower">
            <div className="rent-card">
              <div className="card-title-row">
                <div><b>Rent overview</b><span>Collection records · 2025</span></div>
                <span className="chart-period">This year <ChevronRight size={12} /></span>
              </div>
              <div className="rent-total">RWF 8.4M <span>recorded this month</span></div>
              <div className="bar-chart" aria-label="Illustrative monthly rent records">
                {[38, 53, 46, 67, 55, 74, 62, 86, 69, 78, 60, 92].map((height, i) => (
                  <span key={i} style={{ height: `${height}%` }} className={i === 11 ? "bar-current" : ""} />
                ))}
              </div>
              <div className="chart-months"><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Dec</span></div>
            </div>
            <div className="activity-card">
              <div className="card-title-row"><div><b>Coming up</b><span>Recent activity</span></div><Bell size={14} /></div>
              <div className="activity-row"><span className="activity-icon green"><CircleDollarSign size={14} /></span><div><b>Rent recorded</b><small>Unit 3B · Kimihurura</small></div><time>Today</time></div>
              <div className="activity-row"><span className="activity-icon blue"><CalendarDays size={14} /></span><div><b>Lease renewal</b><small>Unit 2A · Kacyiru</small></div><time>May 18</time></div>
              <div className="activity-row"><span className="activity-icon amber"><Wrench size={14} /></span><div><b>Repair in progress</b><small>Unit 1C · Nyarutarama</small></div><time>May 20</time></div>
            </div>
          </div>
          <div className="dashboard-property-row">
            <div className="property-thumb" aria-hidden="true"><span>🏢</span></div>
            <div><b>Greenview Apartments</b><span>Kimihurura, Kigali · 8 units</span></div>
            <span className="occupancy-pill"><i /> 6 occupied</span>
            <ArrowRight size={15} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrimaryCta({
  title = "Take control of your property management today.",
  description = "Bring your property records, rent tracking and day-to-day tasks together with PropEase.",
  buttonLabel = "Get started",
}: {
  title?: string;
  description?: string;
  buttonLabel?: string;
}) {
  return (
    <section className="cta-section">
      <div className="cta-orb cta-orb-one" /><div className="cta-orb cta-orb-two" />
      <div className="cta-content">
        <SectionEyebrow>YOUR NEXT CHAPTER</SectionEyebrow>
        <h2>{title}</h2>
        <p>{description}</p>
        <Link className="button button-primary" href="/register">{buttonLabel}<ArrowUpRight size={16} /></Link>
        <span className="cta-note"><Check size={14} /> A clearer way to manage, starting here.</span>
      </div>
      <div className="cta-mark" aria-hidden="true"><Building2 size={120} strokeWidth={0.75} /></div>
    </section>
  );
}

export function HomeHero() {
  return (
    <section className="hero-section">
      <div className="hero-background">
        <div className="hero-background-overlay" />
      </div>
      <div className="container hero-container">
        <div className="hero-copy">
          <h1>Manage properties with <span>Ease.</span></h1>
          <p>PropEase helps landlords and property managers organise properties, manage tenants and leases, track rent, document inspections and handle maintenance all in one place.</p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/register">Get started <ArrowUpRight size={17} /></Link>
            <Link className="button button-outline button-large" href="/features">Explore features <ArrowRight size={16} /></Link>
          </div>
      
        </div>
        
      </div>
    </section>
  );
}

export function TrustStrip() {
  return (
    <section className="trust-strip">
      
    </section>
  );
}

export function LandlordVisual() {
  return (
    <div className="landlord-visual">
      <div className="landlord-card-heading"><div><span className="dashboard-date">YOUR PORTFOLIO</span><h3>A quick look around</h3></div><span className="landlord-filter">All properties <ChevronRight size={13} /></span></div>
      <div className="landlord-property-card">
        <div className="landlord-building-image building-one"><Building2 size={34} /></div>
        <div className="landlord-property-details"><span className="property-type">RESIDENTIAL · KIGALI</span><b>Greenview Apartments</b><span>Kimihurura · 8 rental units</span></div>
        <span className="occupancy-pill"><i /> 6 occupied</span>
      </div>
      <div className="landlord-property-card">
        <div className="landlord-building-image building-two"><Building2 size={34} /></div>
        <div className="landlord-property-details"><span className="property-type">RESIDENTIAL · KIGALI</span><b>Umucyo House</b><span>Kacyiru · 4 rental units</span></div>
        <span className="occupancy-pill"><i /> 4 occupied</span>
      </div>
      <div className="landlord-summary">
        <div><span className="benefit-icon mint"><CircleDollarSign size={17} /></span><small>RENT RECORDED</small><b>RWF 2,450,000</b></div>
        <div><span className="benefit-icon blue"><CalendarDays size={17} /></span><small>UPCOMING RENEWALS</small><b>2 this quarter</b></div>
      </div>
    </div>
  );
}

export function StoryQuote({ quote, label }: { quote: string; label: string }) {
  return <div className="story-quote"><span aria-hidden="true">“</span><blockquote>{quote}</blockquote><p>{label}</p></div>;
}
