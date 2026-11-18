'use client';

import { useSyncExternalStore } from 'react';
import { getServerTheme, getTheme, setTheme, subscribeToTheme } from '@/lib/theme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);
  return (
    <button
      type="button"
      role="switch"
      aria-label="Dark mode"
      aria-checked={theme === 'dark'}
      disabled={theme === null}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={`theme-toggle ${className}`}
    >
      <span className="theme-toggle-thumb" aria-hidden="true" />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="4" />
        <path
          strokeLinecap="round"
          d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"
        />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.5 14A8.8 8.8 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"
        />
      </svg>
    </button>
  );
}
