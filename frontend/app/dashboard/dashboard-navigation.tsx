'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sections = [
  { href: '/dashboard/galleries', label: 'Галереї' },
  { href: '/dashboard/portfolio', label: 'Портфоліо' },
] as const;

export function DashboardNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Розділи адмінпанелі" className="mx-auto mt-4 max-w-5xl">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1 sm:inline-grid">
        {sections.map(({ href, label }) => {
          const current = pathname === href ? 'page' : pathname.startsWith(href + '/') ? 'location' : undefined;

          return (
            <Link
              key={href}
              href={href}
              aria-current={current}
              className={
                'flex min-h-11 items-center justify-center rounded-lg px-4 text-center text-sm ' +
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 ' +
                'motion-safe:transition-colors ' +
                (current
                  ? 'bg-zinc-950 font-semibold text-white shadow-sm'
                  : 'font-medium text-zinc-700 hover:bg-white hover:text-zinc-950')
              }
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
