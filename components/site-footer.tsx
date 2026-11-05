import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { Brand } from "@/components/site-header";

const footerGroups = [
  {
    title: "Product",
    links: [
      ["Features", "/features"],
      ["Pricing", "/pricing"],
      ["Create an account", "/register"],
      ["Log in", "/login"],
    ],
  },
  {
    title: "Who it's for",
    links: [
      ["For landlords", "/landlords"],
      ["For property managers", "/property-managers"],
      ["About PropEase", "/about"],
      ["Contact", "/contact"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-main">
          <div className="footer-brand-column">
            <Brand footer />
            <p>Your Properties. Your Tenants. One Easy System.</p>
            <span className="footer-location"><MapPin size={15} /> Kigali, Rwanda</span>
          </div>
          {footerGroups.map((group) => (
            <div className="footer-link-column" key={group.title}>
              <h3>{group.title}</h3>
              {group.links.map(([label, href]) => (
                <Link href={href} key={href}>{label}</Link>
              ))}
            </div>
          ))}
          <div className="footer-link-column footer-contact">
            <h3>Get in touch</h3>
            <Link href="/contact"><Mail size={15} /> Email details coming soon</Link>
            <Link href="/contact"><Phone size={15} /> Phone details coming soon</Link>
            <Link className="footer-contact-cta" href="/contact">
              Contact our team <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} PropEase. All rights reserved.</span>
          <div>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms &amp; conditions</Link>
          </div>
          <span>Made for better property operations.</span>
        </div>
      </div>
    </footer>
  );
}
