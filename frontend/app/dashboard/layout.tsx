import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { REFRESH_TOKEN_COOKIE } from '@/lib/auth/constants';
import { getAuthenticatedAdmin } from '@/lib/auth/server';
import { LogoutButton } from './logout-button';

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    const refreshToken = (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value;
    redirect(refreshToken ? '/auth/refresh' : '/login');
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-6 sm:p-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <Link className="text-sm font-medium uppercase tracking-widest text-zinc-500" href="/dashboard">
            Photo Cloud
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <p className="hidden text-sm text-zinc-500 sm:block">{admin.email}</p>
          <LogoutButton />
        </div>
      </header>
      {children}
    </main>
  );
}
