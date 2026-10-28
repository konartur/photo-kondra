import { redirect } from 'next/navigation';
import { getAuthenticatedAdmin } from '@/lib/auth/server';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  if (await getAuthenticatedAdmin()) redirect('/dashboard');

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">Photo Cloud</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">Admin sign in</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Use the administrator credentials configured for this Photo Cloud instance.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
