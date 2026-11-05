import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <section className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to PropEase</Link>
        <span className="eyebrow"><span className="eyebrow-dot" />GET STARTED</span>
        <h1>Create your PropEase account.</h1>
        <p className="auth-intro">Start building a more organised way to manage your properties.</p>
        <AuthForm mode="register" />
        <p className="auth-switch">Already have an account? <Link href="/login">Log in <ArrowUpRight size={14} /></Link></p>
        <div className="auth-coming-soon"><span>i</span>Account creation is not connected yet. This page is ready for future integration.</div>
      </div>
      <div className="auth-side"><div className="auth-side-decoration"><span /><span /></div><span className="eyebrow"><span className="eyebrow-dot" />A BETTER WAY TO GET ORGANISED</span><h2>Make room for<br /><span>the bigger picture.</span></h2><p>PropEase brings the essential details of property management into one connected workspace.</p><div className="auth-side-mark">P<span>.</span></div></div>
    </section>
  );
}
