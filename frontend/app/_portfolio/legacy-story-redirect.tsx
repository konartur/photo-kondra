'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function LegacyStoryRedirect({ slugs }: { slugs: string[] }) {
  const router = useRouter();

  useEffect(() => {
    const redirect = () => {
      const slug = window.location.hash.match(/^#story\/([a-z]+)$/)?.[1];
      if (slug && slugs.includes(slug)) router.replace(`/stories/${slug}`);
    };

    redirect();
    window.addEventListener('hashchange', redirect);
    return () => window.removeEventListener('hashchange', redirect);
  }, [router, slugs]);

  return null;
}
