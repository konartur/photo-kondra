// Forward only headers used by the client; never relay backend cookies or infrastructure headers.
export function backendResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': response.headers.get('content-type') ?? 'application/json',
    'Cache-Control': 'no-store',
  };
  for (const name of ['Retry-After', 'RateLimit', 'RateLimit-Policy', 'X-Request-Id']) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}
