export const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50';
export const primary = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50';
export const input = 'min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 aria-invalid:border-red-700';
export const panel = 'space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5';

export function AdminImage({ url, alt }: { url: string; alt: string }) {
  if (!/^\/api\/portfolio\/media\/[0-9a-f-]{36}\/variants\/[0-9a-f-]{36}$/i.test(url)) return null;
  // eslint-disable-next-line @next/next/no-img-element -- The URL is an authenticated derivative redirect.
  return <img src={url} alt={alt} loading="lazy" className="aspect-[3/2] w-full max-w-80 rounded-lg bg-zinc-100 object-cover" />;
}
