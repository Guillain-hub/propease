import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <section className="auth-page">
      <div className="auth-card">
        <Link href="/login" className="auth-back"><ArrowLeft size={15} /> Back to log in</Link>
        <span className="eyebrow"><span className="eyebrow-dot" />ACCOUNT RECOVERY</span>
        <h1>Reset your password.</h1>
        <p className="auth-intro">Enter the email address linked to your PropEase account and we’ll send you a secure reset link.</p>
        <PasswordRecoveryForm mode="request" />
      </div>
      <div className="auth-side"><div className="auth-side-decoration"><span /><span /></div><span className="eyebrow"><span className="eyebrow-dot" />PROPERTY MANAGEMENT, REIMAGINED</span><h2>Secure access.<br /><span>A fresh start.</span></h2><p>Your reset link expires after one hour and can only be used once.</p><div className="auth-side-mark">P<span>.</span></div></div>
    </section>
  );
}
