'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function LegacyStoryRedirect({ slugs, prefix = '' }: { slugs?: string[]; prefix?: string }) {
  const router = useRouter();

  useEffect(() => {
    const redirect = () => {
      const slug = window.location.hash.match(/^#story\/([a-z0-9]+(?:-[a-z0-9]+)*)$/)?.[1];
      if (slug && slug.length <= 80 && (!slugs || slugs.includes(slug))) router.replace(`${prefix}/stories/${slug}`);
    };

    redirect();
    window.addEventListener('hashchange', redirect);
    return () => window.removeEventListener('hashchange', redirect);
  }, [router, slugs, prefix]);

  return null;
}
