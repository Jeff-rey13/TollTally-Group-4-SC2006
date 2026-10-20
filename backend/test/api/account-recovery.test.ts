import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MockRoutingAdapter } from '../../src/adapters/routing';
import { TableParkingAdapter } from '../../src/adapters/parking';
import { createApp } from '../../src/app';
import type { MailMessage, Mailer } from '../../src/lib/mailer';
import { ExternalServiceError } from '../../src/lib/errors';
import { routingFailureMessage } from '../../src/modules/trips/service';
import { createTestContext, signedInAgent, uniqueEmail } from '../helpers/context';

type Ctx = Awaited<ReturnType<typeof createTestContext>>;

describe('Keep me signed in, forgotten passwords and routing messages', () => {
  let ctx: Ctx;
  const outbox: MailMessage[] = [];
  const mailer: Mailer = {
    delivers: true,
    async send(message) {
      outbox.push(message);
    },
  };
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ctx = await createTestContext();
    app = createApp({
      prisma: ctx.prisma,
      routing: new MockRoutingAdapter(),
      parking: new TableParkingAdapter(ctx.prisma, ctx.config.PARKING_SEARCH_RADIUS_KM),
      config: ctx.config,
      mailer,
    });
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  const linkToken = (message: MailMessage) =>
    /token=([A-Za-z0-9_-]+)/.exec(message.text)?.[1] ?? '';
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('keeps a driver signed in for 30 days only when they ask for it', async () => {
    const { email, password } = await signedInAgent(app);
    const plain = await request(app).post('/api/auth/login').send({ email, password });
    const remembered = await request(app)
      .post('/api/auth/login')
      .send({ email, password, remember: true });
    const expiry = (res: request.Response) => {
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      return new Date(/Expires=([^;]+)/.exec(cookie)![1]).getTime() - Date.now();
    };
    expect(expiry(plain)).toBeLessThan(31 * 60 * 1000);
    expect(expiry(remembered)).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it('answers a reset request the same way whether or not the email has an account', async () => {
    outbox.length = 0;
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: uniqueEmail('nobody') });
    const { email } = await signedInAgent(app);
    const known = await request(app).post('/api/auth/forgot-password').send({ email });
    await settle();
    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(email);
    expect(outbox[0].text).toContain('/reset-password?token=');
  });

  it('resets the password once, signs out other sessions and refuses the link a second time', async () => {
    outbox.length = 0;
    const { agent, email } = await signedInAgent(app);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    await request(app).post('/api/auth/forgot-password').send({ email });
    await settle();
    const token = linkToken(outbox[0]);
    expect(token.length).toBeGreaterThan(20);

    const weak = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'short' });
    expect(weak.status).toBe(400);

    const ok = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewPass123' });
    expect(ok.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).post('/api/auth/login').send({ email, password: 'Driver1234' })).status,
    ).toBe(401);
    expect(
      (await request(app).post('/api/auth/login').send({ email, password: 'NewPass123' })).status,
    ).toBe(200);

    const again = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'Another123' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('RESET_LINK_INVALID');
  });

  it('refuses an expired reset link', async () => {
    outbox.length = 0;
    const { email } = await signedInAgent(app);
    await request(app).post('/api/auth/forgot-password').send({ email });
    await settle();
    const token = linkToken(outbox[0]);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    await ctx.prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewPass123' });
    expect(res.status).toBe(400);
  });

  it('says what went wrong with routing instead of a vague failure', () => {
    const missing = new ExternalServiceError(
      'routing',
      'UNAUTHORISED',
      'OneMap credentials are not configured',
    );
    expect(routingFailureMessage(missing, false)).toContain('ONEMAP_EMAIL');
    expect(routingFailureMessage(missing, true)).not.toContain('ONEMAP_EMAIL');
    const rejected = new ExternalServiceError('routing', 'UNAUTHORISED', 'rejected');
    expect(routingFailureMessage(rejected, false)).toContain('did not accept the login');
    const slow = new ExternalServiceError('routing', 'TIMEOUT', 'slow');
    expect(routingFailureMessage(slow, false)).toContain('too long');
  });

  it('reports in the health check whether live routing and email are ready', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.routingReady).toBe(true);
    expect(res.body.mailReady).toBe(true);
  });
});
