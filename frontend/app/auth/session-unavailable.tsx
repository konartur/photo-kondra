'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function SessionUnavailable({
  message,
  retryAfter,
}: {
  message: string;
  retryAfter?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      <section className="max-w-md rounded-xl bg-white p-8 text-center text-zinc-900 shadow-sm">
        <h1 className="text-xl font-semibold">Session check temporarily unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-zinc-600">
          {message}
        </p>
        {retryAfter ? (
          <p className="mt-2 text-sm text-zinc-600">
            Try again in approximately {retryAfter} seconds.
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          className="mt-5 rounded-lg bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={() => startTransition(() => router.refresh())}
        >
          {pending ? 'Checking…' : 'Try again'}
        </button>
      </section>
    </main>
  );
}
