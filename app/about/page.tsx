import type { Metadata } from "next";
import { ArrowUpRight, Compass, HeartHandshake, Lightbulb, MapPin, Target } from "lucide-react";
import Link from "next/link";
import { PageIntro, PrimaryCta } from "@/components/marketing";

export const metadata: Metadata = {
  title: "About Us",
  description: "Learn about PropEase and our mission to simplify property management in Rwanda and beyond.",
};

export default function AboutPage() {
  return (
    <div className="about-page">
      <section className="page-hero about-hero">
        <div className="container"><PageIntro eyebrow="ABOUT PROPEASE" title="A simpler way to manage the places we call home." description="PropEase is a property management platform built to help landlords and property managers bring their everyday operations into clearer focus." /><div className="about-location"><MapPin size={16} /> Built with the Rwandan property market in mind</div></div>
        <div className="about-hero-shapes" aria-hidden="true"><span /><span /><span /></div>
      </section>
      <section className="section">
        <div className="container story-layout">
          <div className="story-copy"><span className="eyebrow"><span className="eyebrow-dot" />WHY PROPEASE</span><h2>Property management has a lot of moving parts.</h2><p>Property details, tenants, lease dates, rent records, inspections and repairs all need attention. When that information lives in different places, it can be harder to keep track of the whole picture.</p><p>PropEase is being built to make those everyday tasks more organised — with a dedicated workspace for the records and workflows behind property management.</p><Link href="/features" className="text-link">Explore what PropEase does <ArrowUpRight size={16} /></Link></div>
          <div className="story-visual"><div className="story-visual-grid" /><div className="story-visual-card"><span className="benefit-icon mint"><Compass size={22} /></span><span className="story-card-label">OUR STARTING POINT</span><b>Make the everyday easier to manage.</b><span className="story-card-rule" /><small>Property operations<br />in one organised place.</small></div><span className="story-visual-caption"><MapPin size={14} /> Kigali, Rwanda</span></div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container mission-grid">
          <article className="mission-card"><span className="mission-icon"><Target size={23} /></span><span className="eyebrow">OUR MISSION</span><h2>To simplify property management through accessible technology, organised information and efficient workflows.</h2></article>
          <article className="mission-card mission-card-dark"><span className="mission-icon"><Lightbulb size={23} /></span><span className="eyebrow">OUR VISION</span><h2>To become a trusted property management solution for landlords and property managers in Rwanda and beyond.</h2></article>
        </div>
      </section>
      <section className="section problem-section">
        <div className="container problem-layout"><div><span className="eyebrow"><span className="eyebrow-dot" />WHY WE&apos;RE BUILDING FOR RWANDA</span><h2>Local context.<br />Practical technology.</h2></div><div className="problem-copy"><HeartHandshake size={26} /><p>Property management in Rwanda deserves tools that make it easier to organise records, coordinate work and keep people informed. We are building PropEase with those practical needs in mind — starting in Kigali.</p><span>Our aim is to build thoughtfully, listen closely and make property operations feel less fragmented.</span></div></div>
      </section>
      <div className="container"><PrimaryCta title="Build a clearer way to manage." description="See how PropEase brings property management essentials into one workspace." buttonLabel="Explore PropEase" /></div>
    </div>
  );
}
