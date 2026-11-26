"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ScrollReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = revealRef.current;
    if (!element) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    element.classList.add("is-pending");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        element.classList.remove("is-pending");
        element.classList.add("is-visible");
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -36px 0px" },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`scroll-reveal${className ? ` ${className}` : ""}`}
      ref={revealRef}
    >
      {children}
    </div>
  );
}
