/**
 * Error carrying an HTTP status, a stable error code and optional field messages.
 * The error handler turns it into the JSON error body the client shows next to each field.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly retryable?: boolean,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (what: string): HttpError =>
  new HttpError(404, 'NOT_FOUND', `${what} was not found`);

export type ExternalService = 'routing' | 'parking' | 'traffic' | 'weather';
export type ExternalFailureKind = 'TIMEOUT' | 'MALFORMED' | 'UNAVAILABLE' | 'UNAUTHORISED';

/**
 * Raised by an adapter when a provider times out, refuses access or returns malformed data.
 * Mapped to a retryable 503 so the trip stays planned and the session survives (NFR-REL-02).
 */
export class ExternalServiceError extends Error {
  constructor(
    public readonly service: ExternalService,
    public readonly kind: ExternalFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}
