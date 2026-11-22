'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import styles from './portfolio.module.css';

export function PortfolioMotion({ className, children, locale = 'uk' }: {
  className: string; children: ReactNode; locale?: 'uk' | 'en';
}) {
  const portfolio = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !new URLSearchParams(location.search).has('hero-debug')) return;
    const element = portfolio.current;
    const image = element?.querySelector('#home img');
    const services = element?.querySelector('#services');
    if (!element || !image || !services) return;

    const viewport = window.visualViewport;
    const panel = document.createElement('pre');
    const probes = ['svh', 'lvh', 'dvh'].map((unit) => {
      const probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;width:0;height:100${unit};padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:content-box;`;
      element.appendChild(probe);
      return probe;
    });
    panel.className = styles.heroDiagnostics;
    element.setAttribute('data-hero-debug', '');
    element.appendChild(panel);

    const update = () => {
      const visibleBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      const imageBottom = image.getBoundingClientRect().bottom;
      const servicesTop = services.getBoundingClientRect().top;
      const sizes = probes.map((probe) => getComputedStyle(probe));
      const hero = element.querySelector('#home');
      panel.textContent = [
        'HERO DEBUG v7',
        `scrollY ${Math.round(window.scrollY)} | screen ${screen.height}`,
        `inner ${window.innerHeight} | client ${document.documentElement.clientHeight}`,
        `viewport bottom ${visibleBottom.toFixed(1)} | scale ${viewport?.scale ?? 1}`,
        `svh/lvh/dvh ${sizes.map((size) => parseFloat(size.height).toFixed(0)).join('/')}`,
        `safe top/bottom ${sizes[0].paddingTop}/${sizes[0].paddingBottom}`,
        `hero height ${hero?.getBoundingClientRect().height.toFixed(1)}`,
        `hero end ${imageBottom.toFixed(1)} | services ${servicesTop.toFixed(1)}`,
      ].join('\n');
    };

    // Measure after the viewport effect and restored browser state have settled.
    let frame = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    scheduleUpdate();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('pageshow', scheduleUpdate);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
      window.removeEventListener('pageshow', scheduleUpdate);
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      panel.remove();
      probes.forEach((probe) => probe.remove());
      element.removeAttribute('data-hero-debug');
    };
  }, []);

  useLayoutEffect(() => {
    const element = portfolio.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) return;
    const phone = window.matchMedia('(max-width: 760px) and (pointer: coarse)');
    let width = window.innerWidth;
    let screenSize = `${screen.width}x${screen.height}`;
    let heroHeight = parseFloat(getComputedStyle(element).getPropertyValue('--portfolio-hero-height')) || Math.ceil(viewport.height);

    const updateViewportHeight = () => {
      element.toggleAttribute('data-portfolio-scrolled', window.scrollY > 0);
      if (viewport.scale === 1 && viewport.height > 0) {
        const visibleBottom = Math.ceil(viewport.offsetTop + viewport.height);
        const nextScreenSize = `${screen.width}x${screen.height}`;
        // Browser toolbar changes must not resize the section or move its caption.
        // Recalculate for a different device orientation or a real window resize.
        if (!phone.matches || window.innerWidth !== width || nextScreenSize !== screenSize) {
          heroHeight = Math.ceil(viewport.height);
          width = window.innerWidth;
          screenSize = nextScreenSize;
        }
        const photoHeight = Math.max(
          window.innerHeight,
          document.documentElement.clientHeight,
          visibleBottom,
          phone.matches ? window.screen.height : 0,
        );
        element.style.setProperty('--portfolio-visible-height', `${Math.ceil(viewport.height)}px`);
        element.style.setProperty('--portfolio-visible-top', `${Math.max(0, viewport.offsetTop)}px`);
        element.style.setProperty('--portfolio-hero-height', `${heroHeight}px`);
        element.style.setProperty('--portfolio-photo-height', `${photoHeight}px`);
      }
    };

    updateViewportHeight();
    viewport.addEventListener('resize', updateViewportHeight);
    viewport.addEventListener('scroll', updateViewportHeight, { passive: true });
    window.addEventListener('scroll', updateViewportHeight, { passive: true });
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('pageshow', updateViewportHeight);
    phone.addEventListener('change', updateViewportHeight);
    return () => {
      viewport.removeEventListener('resize', updateViewportHeight);
      viewport.removeEventListener('scroll', updateViewportHeight);
      window.removeEventListener('scroll', updateViewportHeight);
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('pageshow', updateViewportHeight);
      phone.removeEventListener('change', updateViewportHeight);
      element.style.removeProperty('--portfolio-visible-height');
      element.style.removeProperty('--portfolio-visible-top');
      element.style.removeProperty('--portfolio-hero-height');
      element.style.removeProperty('--portfolio-photo-height');
      element.removeAttribute('data-portfolio-scrolled');
    };
  }, []);

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

  return <div ref={portfolio} className={className} data-portfolio lang={locale}>{children}</div>;
}
