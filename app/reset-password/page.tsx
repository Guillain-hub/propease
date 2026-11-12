import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <section className="auth-page">
      <div className="auth-card">
        <Link href="/login" className="auth-back"><ArrowLeft size={15} /> Back to log in</Link>
        <span className="eyebrow"><span className="eyebrow-dot" />ACCOUNT RECOVERY</span>
        <h1>Choose a new password.</h1>
        <p className="auth-intro">Use a password with at least 12 characters.</p>
        <PasswordRecoveryForm mode="reset" />
      </div>
      <div className="auth-side"><div className="auth-side-decoration"><span /><span /></div><span className="eyebrow"><span className="eyebrow-dot" />PROPERTY MANAGEMENT, REIMAGINED</span><h2>Your workspace.<br /><span>Back in reach.</span></h2><p>Reset links expire after one hour and can only be used once.</p><div className="auth-side-mark">P<span>.</span></div></div>
    </section>
  );
}
