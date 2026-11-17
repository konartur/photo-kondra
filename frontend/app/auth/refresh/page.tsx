'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ApiError } from '@/lib/api/client';

async function refreshSession(): Promise<void> {
  const response = await fetch('/api/auth/refresh', { method: 'POST' });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'Unable to refresh the session';
    throw new ApiError(message, response.status);
  }
}

export default function RefreshSessionPage() {
  const router = useRouter();
  const { mutate, error, isPending } = useMutation({
    mutationFn: refreshSession,
    onSuccess: () => {
      router.replace('/dashboard');
      router.refresh();
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 401) {
        router.replace('/login');
        router.refresh();
      }
    },
  });

  useEffect(() => {
    mutate();
  }, [mutate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      <div className="text-center text-sm text-zinc-600">
        {error && !isPending ? (
          <>
            <p role="alert">{error.message}</p>
            <button type="button" className="mt-4 underline" onClick={() => mutate()}>
              Try again
            </button>
          </>
        ) : (
          <p>Restoring your session…</p>
        )}
      </div>
    </main>
  );
}
