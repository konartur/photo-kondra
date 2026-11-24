function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function recoveredStorySave(
  server: { draftVersion: number; draft: unknown; photos?: unknown },
  attempt: { version: number; data: unknown; photos: unknown },
) {
  return (
    server.draftVersion === attempt.version + 1 &&
    JSON.stringify(canonical(server.draft)) === JSON.stringify(canonical(attempt.data)) &&
    JSON.stringify(canonical(server.photos)) === JSON.stringify(canonical(attempt.photos))
  );
}
