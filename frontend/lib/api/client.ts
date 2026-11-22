export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fields: readonly string[] = [],
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await fetch(path, init);

  if (response.status === 401 && path !== '/api/auth/refresh') {
    const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' });
    if (refreshResponse.ok) response = await fetch(path, init);
    else if (refreshResponse.status !== 401)
      throw await readApiError(refreshResponse);
  }

  if (!response.ok) throw await readApiError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

async function readApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const fallback = 'The request could not be completed';
  if (typeof body !== 'object' || body === null) return new ApiError(fallback, response.status);
  const { message, code, errors } = body as Record<string, unknown>;
  const fields: string[] = [];
  if (Array.isArray(errors)) {
    for (const item of errors as unknown[]) {
      if (item && typeof item === 'object' && 'field' in item && typeof item.field === 'string')
        fields.push(item.field);
    }
  }
  const text = typeof message === 'string' ? message
    : Array.isArray(message) && message.every((item) => typeof item === 'string') ? message.join(', ') : fallback;
  return new ApiError(text, response.status, typeof code === 'string' ? code : undefined, fields);
}
