import type { ApiErrorBody } from '@tolltally/shared';

/**
 * Error thrown for a non-2xx API response, carrying the status, code and field messages.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'TollTally could not be reached. Check your internet connection and try again.',
      {},
      true,
    );
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    if (res.status === 401 && err?.code === 'UNAUTHENTICATED') onSessionExpired?.();
    throw new ApiError(
      res.status,
      err?.code ?? 'ERROR',
      err?.message ?? `The request failed (${res.status})`,
      err?.fields ?? {},
      err?.retryable ?? false,
    );
  }
  return data as T;
}

/**
 * Minimal JSON client for the TollTally API. Sends the session cookie and turns error bodies into ApiError.
 */
export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

/**
 * Turns any error into a user-facing message and field errors for the forms.
 */
export function describeError(err: unknown): {
  message: string;
  fields: Record<string, string>;
  retryable: boolean;
} {
  if (err instanceof ApiError)
    return { message: err.message, fields: err.fields, retryable: err.retryable };
  if (err instanceof Error) return { message: err.message, fields: {}, retryable: false };
  return { message: 'Something went wrong', fields: {}, retryable: false };
}
