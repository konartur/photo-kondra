'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export function LogoutButton() {
  const router = useRouter();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      router.replace('/login');
      router.refresh();
    },
  });

  return (
    <button
      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed"
      disabled={logoutMutation.isPending}
      onClick={() => logoutMutation.mutate()}
      type="button"
    >
      {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
