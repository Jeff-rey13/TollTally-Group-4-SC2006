import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { Router } from 'express';
import {
  PRIVACY_NOTICE_VERSION,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type DeleteAccountInput,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type RegisterInput,
  type UserDto,
} from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { HttpError } from '../../lib/errors';
import type { Mailer } from '../../lib/mailer';
import { hashPassword, verifyPassword } from '../../lib/password';
import { currentUser } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';

export const SESSION_COOKIE = 'tolltally.sid';

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

export function toUserDto(user: User): UserDto {
  return { id: user.id, email: user.email, role: user.role };
}

function startSession(req: Request, user: User, maxAgeMs?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      if (maxAgeMs) req.session.cookie.maxAge = maxAgeMs;
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

/**
 * «boundary» router and AccountController logic for UC-01 Register, UC-02 Sign in and UC-03 Sign out.
 */
export const hashResetToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Where reset links point. APP_URL wins; on Render the site address is known; on a developer's
 * machine the address the request came in on is used. In production the request's Host header is
 * never trusted, so a forged header cannot send a reset link to another site.
 */
function appBaseUrl(deps: AppDeps, req: Request): string | null {
  const configured = deps.config.APP_URL ?? process.env.RENDER_EXTERNAL_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (deps.config.NODE_ENV === 'production') return null;
  return `${req.protocol}://${req.get('host')}`;
}

export function authRoutes(deps: AppDeps, mailer: Mailer): Router {
  const router = Router();

  router.post('/register', validateBody(registerSchema), async (req, res) => {
    const { email, password } = req.body as RegisterInput;
    const normalised = email.trim().toLowerCase();
    const generic = new HttpError(
      400,
      'REGISTRATION_FAILED',
      'Registration could not be completed with these details',
    );
    const existing = await deps.prisma.user.findUnique({ where: { email: normalised } });
    if (existing) throw generic;
    let user: User;
    try {
      user = await deps.prisma.user.create({
        data: {
          email: normalised,
          passwordHash: hashPassword(password),
          role: 'DRIVER',
          privacyConsentAt: new Date(),
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        },
      });
    } catch {
      throw generic;
    }
    await startSession(req, user);
    res.status(201).json({ user: toUserDto(user) });
  });

  router.post('/login', validateBody(loginSchema), async (req, res) => {
    const { email, password, remember } = req.body as LoginInput;
    const user = await deps.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const valid = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'The email address or password is incorrect');
    }
    await startSession(
      req,
      user,
      remember ? deps.config.REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000 : undefined,
    );
    res.json({ user: toUserDto(user) });
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(SESSION_COOKIE);
      res.status(204).end();
    });
  });

  // Forgotten password: always the same answer, so the form cannot be used to find out which
  // emails have accounts. The link is single-use and expires after PASSWORD_RESET_MINUTES.
  router.post('/forgot-password', validateBody(forgotPasswordSchema), async (req, res) => {
    const { email } = req.body as ForgotPasswordInput;
    const user = await deps.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const base = appBaseUrl(deps, req);
    if (user && base) {
      const token = randomBytes(32).toString('base64url');
      const minutes = deps.config.PASSWORD_RESET_MINUTES;
      await deps.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await deps.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: new Date(Date.now() + minutes * 60 * 1000),
        },
      });
      const link = `${base}/reset-password?token=${token}`;
      // Not awaited, so the response time does not reveal whether an account exists.
      mailer
        .send({
          to: user.email,
          subject: 'Reset your TollTally password',
          text:
            `Someone asked to reset the password for your TollTally account.\n\n` +
            `Open this link within ${minutes} minutes to choose a new password:\n${link}\n\n` +
            `If this wasn't you, ignore this email. Your password stays the same.`,
        })
        .catch((err: unknown) => {
          console.error(`[mail] Password reset email failed: ${(err as Error).message}`);
        });
    } else if (user && !base) {
      console.error('[mail] Set APP_URL in production so password reset links can be built.');
    }
    res.status(202).json({ ok: true });
  });

  router.post('/reset-password', validateBody(resetPasswordSchema), async (req, res) => {
    const { token, password } = req.body as ResetPasswordInput;
    const record = await deps.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new HttpError(
        400,
        'RESET_LINK_INVALID',
        'This reset link has expired or was already used. Ask for a new one.',
      );
    }
    await deps.prisma.$transaction([
      deps.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: hashPassword(password) },
      }),
      deps.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      deps.prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, id: { not: record.id } },
      }),
      // Sign the account out everywhere, in case someone else had the old password.
      deps.prisma.session.deleteMany({
        where: { data: { contains: `"userId":"${record.userId}"` } },
      }),
    ]);
    res.json({ ok: true });
  });

  // Withdrawal of consent: a driver can delete the account and everything stored with it
  // (vehicle profiles, trips, estimates and logged costs cascade with the user row).
  router.delete('/account', validateBody(deleteAccountSchema), async (req, res, next) => {
    const sessionUser = currentUser(req);
    if (!sessionUser) throw new HttpError(401, 'UNAUTHENTICATED', 'Not signed in');
    const user = await deps.prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Not signed in');
    if (user.role !== 'DRIVER') {
      throw new HttpError(
        403,
        'FORBIDDEN',
        'Administrator accounts are removed by another administrator, not from this page',
      );
    }
    const { password } = req.body as DeleteAccountInput;
    if (!verifyPassword(password, user.passwordHash)) {
      throw new HttpError(400, 'VALIDATION', 'Check the highlighted fields', {
        password: 'The password is incorrect',
      });
    }
    await deps.prisma.user.delete({ where: { id: user.id } });
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(SESSION_COOKIE);
      res.status(204).end();
    });
  });

  router.get('/me', async (req, res) => {
    const sessionUser = currentUser(req);
    if (!sessionUser) throw new HttpError(401, 'UNAUTHENTICATED', 'Not signed in');
    const user = await deps.prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Not signed in');
    res.json({ user: toUserDto(user) });
  });

  return router;
}
