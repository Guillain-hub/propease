import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <section className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to PropEase</Link>
        <span className="eyebrow"><span className="eyebrow-dot" />WELCOME BACK</span>
        <h1>Log in to your workspace.</h1>
        <p className="auth-intro">Your property management workspace is just around the corner.</p>
        <AuthForm mode="login" />
        <p className="auth-switch">New to PropEase? <Link href="/register">Create an account <ArrowUpRight size={14} /></Link></p>
        <div className="auth-coming-soon"><span>i</span>Authentication is not connected yet. This page is ready for future integration.</div>
      </div>
      <div className="auth-side"><div className="auth-side-decoration"><span /><span /></div><span className="eyebrow"><span className="eyebrow-dot" />PROPERTY MANAGEMENT, REIMAGINED</span><h2>Everything in its place.<br /><span>Nothing falling through.</span></h2><p>A clearer way to keep properties, tenants, rent records and maintenance in reach.</p><div className="auth-side-mark">P<span>.</span></div></div>
    </section>
  );
}
