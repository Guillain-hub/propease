import { Mail, MapPin, Phone } from "lucide-react";
import { ContactForm } from "@/components/contact-form";

const faqs = [
  [
    "Who is PropEase for?",
    "PropEase is being built for landlords and property managers who want to organise the properties, tenants, leases and operational tasks they manage.",
  ],
  [
    "Can I use PropEase outside Kigali?",
    "PropEase is starting with the Rwandan property market. Get in touch to share where you manage properties.",
  ],
  [
    "How can I learn about pricing?",
    "Check our pricing page for plan details and updates.",
  ],
  [
    "Can I request a product walkthrough?",
    "Send us a message and tell us what you manage. We will share more about available product information as it is ready.",
  ],
];

export function ContactSection() {
  return (
    <>
      <section className="section contact-main">
        <div className="container">
          <div className="contact-layout">
            <div className="contact-form-panel">
              <div className="contact-panel-heading">
                <span className="eyebrow">
                  <span className="eyebrow-dot" />
                  SEND US A MESSAGE
                </span>
                <h2>How can we help?</h2>
                <p>Share a few details and we&apos;ll know how to follow up.</p>
              </div>
              <ContactForm />
            </div>
            <aside className="contact-side">
              <div className="contact-details-card">
                <h3>Contact details</h3>
                <p>
                  We&apos;re preparing our direct contact details. For now,
                  please use the message form.
                </p>
                <div className="contact-detail">
                  <span><Mail size={17} /></span>
                  <div><small>EMAIL</small><b>Details coming soon</b></div>
                </div>
                <div className="contact-detail">
                  <span><Phone size={17} /></span>
                  <div><small>PHONE</small><b>Details coming soon</b></div>
                </div>
                <div className="contact-detail">
                  <span><MapPin size={17} /></span>
                  <div><small>LOCATION</small><b>Kigali, Rwanda</b></div>
                </div>
              </div>
              <div className="contact-note">
                <span className="contact-note-mark">?</span>
                <div>
                  <b>Looking for something specific?</b>
                  <p>
                    Tell us whether you&apos;re a landlord or property manager
                    and what you&apos;d like to organise.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container faq-layout">
          <div className="faq-intro">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              QUICK ANSWERS
            </span>
            <h2>Frequently<br />asked questions.</h2>
            <p>Some quick details about PropEase and getting in touch.</p>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer]) => (
              <details className="faq-item" key={question}>
                <summary>{question}<span>+</span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
