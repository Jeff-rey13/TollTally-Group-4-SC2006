import session from 'express-session';
import type { PrismaClient } from '@prisma/client';

type Callback = (err?: unknown, value?: session.SessionData | null) => void;

/**
 * Adapter that lets express-session keep sessions in the Session table, so server-side
 * sign-out (FR-ACC-07) and the inactivity expiry (NFR-SEC-02) survive a restart.
 */
export class PrismaSessionStore extends session.Store {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ttlMs: number,
  ) {
    super();
  }

  private expiryFor(data: session.SessionData): Date {
    const expires = data.cookie?.expires;
    return expires ? new Date(expires) : new Date(Date.now() + this.ttlMs);
  }

  get(sid: string, cb: Callback): void {
    this.prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        if (!row || row.expiresAt.getTime() < Date.now()) return cb(null, null);
        cb(null, JSON.parse(row.data) as session.SessionData);
      })
      .catch((err) => cb(err));
  }

  set(sid: string, data: session.SessionData, cb?: (err?: unknown) => void): void {
    const payload = JSON.stringify(data);
    const expiresAt = this.expiryFor(data);
    this.prisma.session
      .upsert({
        where: { sid },
        create: { id: sid, sid, data: payload, expiresAt },
        update: { data: payload, expiresAt },
      })
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  touch(sid: string, data: session.SessionData, cb?: (err?: unknown) => void): void {
    this.prisma.session
      .updateMany({ where: { sid }, data: { expiresAt: this.expiryFor(data) } })
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    this.prisma.session
      .deleteMany({ where: { sid } })
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }
}
