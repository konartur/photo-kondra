'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function PortfolioMotion({ className, children }: { className: string; children: ReactNode }) {
  const portfolio = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!portfolio.current || typeof IntersectionObserver === 'undefined') return;

    const targets = portfolio.current.querySelectorAll<HTMLElement>('[data-portfolio-reveal]');
    const observer = new IntersectionObserver((entries) => {
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue;
        target.setAttribute('data-reveal-state', 'visible');
        observer.unobserve(target);
      }
    }, { threshold: 0.08 });

    for (const target of targets) {
      target.setAttribute('data-reveal-state', 'pending');
      observer.observe(target);
    }

    return () => {
      observer.disconnect();
      for (const target of targets) target.removeAttribute('data-reveal-state');
    };
  }, []);

  return <div ref={portfolio} className={className} data-portfolio lang="uk">{children}</div>;
}
