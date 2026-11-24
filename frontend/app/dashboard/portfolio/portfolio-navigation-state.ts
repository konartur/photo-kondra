'use client';

import { useEffect, useRef, useState } from 'react';

export type PortfolioSection = 'settings' | 'contacts' | 'services' | 'stories' | 'media';
type Location = { section: PortfolioSection; id: string | null };
const sections = new Set(['settings', 'contacts', 'services', 'stories', 'media']);
function readLocation(): Location {
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section') ?? 'settings';
  const id = params.get('entry');
  return {
    section: sections.has(section) ? (section as PortfolioSection) : 'settings',
    id: section === 'services' || section === 'stories' ? id : null,
  };
}

export function usePortfolioNavigation(dirty: boolean, onLeave: () => void) {
  const [location, setLocation] = useState<Location>({ section: 'settings', id: null });
  const [session, setSession] = useState(0);
  const [ready, setReady] = useState(false);
  const savedUrl = useRef('');
  const index = useRef(0);
  const reverting = useRef(false);
  const dirtyRef = useRef(dirty);
  const onLeaveRef = useRef(onLeave);
  useEffect(() => {
    dirtyRef.current = dirty;
    onLeaveRef.current = onLeave;
  }, [dirty, onLeave]);
  useEffect(() => {
    savedUrl.current = window.location.href;
    index.current = window.history.state?.portfolioIndex ?? 0;
    window.history.replaceState(
      { ...window.history.state, portfolioIndex: index.current },
      '',
      window.location.href,
    );
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setLocation(readLocation());
        setReady(true);
      }
    });
    const pop = () => {
      if (reverting.current) {
        reverting.current = false;
        return;
      }
      const next = readLocation();
      const sameSettings =
        ['settings', 'contacts'].includes(next.section) &&
        ['settings', 'contacts'].includes(
          new URL(savedUrl.current).searchParams.get('section') ?? 'settings',
        );
      const nextIndex = window.history.state?.portfolioIndex;
      if (
        dirtyRef.current &&
        !sameSettings &&
        !window.confirm('Залишити редактор без збереження введених змін?')
      ) {
        if (typeof nextIndex === 'number' && nextIndex !== index.current) {
          reverting.current = true;
          window.history.go(index.current - nextIndex);
        } else
          window.history.pushState(
            { ...window.history.state, portfolioIndex: index.current },
            '',
            savedUrl.current,
          );
        return;
      }
      if (!sameSettings) {
        onLeaveRef.current();
        dirtyRef.current = false;
        setSession((value) => value + 1);
      }
      index.current = nextIndex ?? index.current;
      savedUrl.current = window.location.href;
      setLocation(next);
    };
    const guardLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || !dirtyRef.current)
        return;
      if (anchor.href === window.location.href || anchor.getAttribute('href')?.startsWith('#'))
        return;
      if (!window.confirm('Залишити редактор без збереження введених змін?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('popstate', pop);
    document.addEventListener('click', guardLink, true);
    return () => {
      active = false;
      window.removeEventListener('popstate', pop);
      document.removeEventListener('click', guardLink, true);
    };
  }, []);
  function navigate(section: PortfolioSection, id: string | null = null, replace = false) {
    if (!replace && section === location.section && id === location.id) return;
    const sameSettings =
      ['settings', 'contacts'].includes(section) &&
      ['settings', 'contacts'].includes(location.section);
    if (
      !replace &&
      dirty &&
      !sameSettings &&
      !window.confirm('Залишити редактор без збереження введених змін?')
    )
      return;
    const url = new URL(window.location.href);
    url.searchParams.set('section', section);
    if (id) url.searchParams.set('entry', id);
    else url.searchParams.delete('entry');
    if (!replace) index.current++;
    window.history[replace ? 'replaceState' : 'pushState'](
      { ...window.history.state, portfolioIndex: index.current },
      '',
      url,
    );
    savedUrl.current = url.href;
    if (!sameSettings && !replace) {
      onLeaveRef.current();
      dirtyRef.current = false;
      setSession((value) => value + 1);
    }
    setLocation({ section, id });
  }
  return { ...location, ready, navigate, session };
}
