"use client";

import { useState, type FormEvent } from "react";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="form-field"><label htmlFor="contact-name">Full name</label><input id="contact-name" name="name" autoComplete="name" placeholder="Your name" required /></div>
      <div className="form-field"><label htmlFor="contact-email">Email address</label><input id="contact-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
      <div className="form-field"><label htmlFor="contact-subject">Subject</label><input id="contact-subject" name="subject" placeholder="What would you like to discuss?" required /></div>
      <div className="form-field"><label htmlFor="contact-message">Message</label><textarea id="contact-message" name="message" rows={5} placeholder="Tell us a little more..." required /></div>
      <button type="submit" className="button button-primary button-large">Send message <span>→</span></button>
      {submitted && <p className="form-feedback" role="status">Thanks for reaching out. This demo form is not connected yet, so your message hasn&apos;t been sent.</p>}
      <span className="form-privacy-note">This form is a preview and does not send or store your information.</span>
    </form>
  );
}
