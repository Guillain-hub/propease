"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const productLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/landlords", label: "For Landlords" },
  { href: "/property-managers", label: "For Managers" },
];

const companyLinks = [
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact" },
];

export function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand${footer ? " brand-footer" : ""}`}
      aria-label="PropEase home"
    >
      {footer ? (
        <>
          <span className="brand-icon" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>Prop<span className="brand-accent">Ease</span></span>
        </>
      ) : (
        <span className="brand-logo">
          <Image
            src="/images/new logo.png"
            alt=""
            fill
            priority
            sizes="(max-width: 620px) 150px, 190px"
          />
        </span>
      )}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(pathname !== "/");

  useEffect(() => {
    const updateHeader = () => {
      setScrolled(pathname !== "/" || window.scrollY > 0);
    };

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    window.addEventListener("resize", updateHeader);

    return () => {
      window.removeEventListener("scroll", updateHeader);
      window.removeEventListener("resize", updateHeader);
    };
  }, [pathname]);

  return (
    <header className={`site-header${scrolled ? " site-header-scrolled" : " site-header-transparent"}`}>
      <div className="nav-shell">
        <div className="nav-left">
          <Brand />
          <nav className="desktop-nav" aria-label="Product navigation">
            {productLinks.map(({ href, label }) => (
              <Link key={href} href={href} className="nav-link">
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="nav-right">
          <nav className="desktop-nav" aria-label="Company navigation">
            {companyLinks.map(({ href, label }) => (
              <Link key={href} href={href} className="nav-link">
                {label}
              </Link>
            ))}
          </nav>
          <Link className="login-link" href="/login">Log in</Link>
        </div>
        <button
          type="button"
          className="menu-toggle"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
          {[...productLinks, ...companyLinks].map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          <Link href="/login" onClick={() => setOpen(false)}>Log in</Link>
        </nav>
      )}
    </header>
  );
}
