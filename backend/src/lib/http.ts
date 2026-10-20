import { ExternalServiceError, type ExternalService } from './errors';

/**
 * Fetches JSON from a provider with a timeout, converting every failure into ExternalServiceError.
 */
export async function fetchJson<T>(
  service: ExternalService,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new ExternalServiceError(
        service,
        'TIMEOUT',
        `The ${service} service did not respond within ${timeoutMs} ms`,
      );
    }
    throw new ExternalServiceError(
      service,
      'UNAVAILABLE',
      `The ${service} service could not be reached`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ExternalServiceError(
      service,
      'UNAUTHORISED',
      `The ${service} service rejected the credentials`,
    );
  }
  if (!res.ok) {
    throw new ExternalServiceError(
      service,
      'UNAVAILABLE',
      `The ${service} service returned HTTP ${res.status}`,
    );
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ExternalServiceError(
      service,
      'MALFORMED',
      `The ${service} service returned an unreadable response`,
    );
  }
}
