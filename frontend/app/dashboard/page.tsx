import Link from 'next/link';

export default function DashboardPage() {
  return (
    <section className="mx-auto mt-10 max-w-5xl rounded-2xl border border-zinc-200 bg-white p-8">
      <h2 className="text-xl font-semibold text-zinc-950">Manage your galleries</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
        Create and organize private photo galleries. Photo upload will be added in a later milestone.
      </p>
      <Link
        className="mt-6 inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
        href="/dashboard/galleries"
      >
        Open galleries
      </Link>
    </section>
  );
}
