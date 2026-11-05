"use client";

import { useState, type FormEvent } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [submitted, setSubmitted] = useState(false);
  const isRegister = mode === "register";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {isRegister && <div className="form-field"><label htmlFor="auth-name">Full name</label><input id="auth-name" name="name" autoComplete="name" placeholder="Your name" required /></div>}
      <div className="form-field"><label htmlFor="auth-email">Email address</label><input id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
      <div className="form-field"><label htmlFor="auth-password">Password</label><input id="auth-password" name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={8} placeholder="At least 8 characters" required /></div>
      <button type="submit" className="button button-primary button-large">{isRegister ? "Create account" : "Log in"} <span>→</span></button>
      {submitted && <p className="form-feedback" role="status">Thanks! Account access is not available yet. Your details have not been sent or saved.</p>}
    </form>
  );
}
