import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 text-zinc-950">
      <section className="max-w-md text-center">
        <p className="text-sm font-medium text-zinc-500">404</p>
        <h1 className="mt-3 text-3xl font-semibold">Page not found</h1>
        <p className="mt-3 text-zinc-600">This page does not exist or is no longer available.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white"
        >
          Back to Photo Cloud
        </Link>
      </section>
    </main>
  );
}
