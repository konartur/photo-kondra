'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

async function refreshSession(): Promise<void> {
  const response = await fetch('/api/auth/refresh', { method: 'POST' });
  if (!response.ok) throw new Error('Unable to refresh the session');
}

export default function RefreshSessionPage() {
  const router = useRouter();
  const { mutate } = useMutation({
    mutationFn: refreshSession,
    onSuccess: () => {
      router.replace('/dashboard');
      router.refresh();
    },
    onError: () => {
      router.replace('/login');
      router.refresh();
    },
  });

  useEffect(() => {
    mutate();
  }, [mutate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      <p className="text-sm text-zinc-600">Restoring your session…</p>
    </main>
  );
}
