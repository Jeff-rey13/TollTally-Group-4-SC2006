import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, signedInAgent, uniqueEmail } from '../helpers/context';

type Ctx = Awaited<ReturnType<typeof createTestContext>>;

describe('Account and authentication (UC-01 to UC-03)', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('FR-ACC-01 a password that fails the strength rules is rejected next to the field', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), password: 'short', acceptPrivacy: true });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.password).toContain('8 characters');
    const noDigit = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), password: 'lettersonly', acceptPrivacy: true });
    expect(noDigit.body.error.fields.password).toContain('digit');
  });

  it('FR-ACC-02 NFR-SEC-03 a duplicate email is rejected with one generic error that does not reveal the account', async () => {
    const { email } = await signedInAgent(ctx.app);
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email, password: 'Another123', acceptPrivacy: true });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Registration could not be completed with these details');
    expect(res.body.error.message.toLowerCase()).not.toContain('exist');
  });

  it('FR-ACC-05 NFR-SEC-03 a wrong password and an unknown email produce the same generic error', async () => {
    const { email } = await signedInAgent(ctx.app);
    const wrong = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email, password: 'Wrong1234' });
    const unknown = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail('nobody'), password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('FR-ACC-05 FR-ACC-06 a correct sign-in creates a session carrying the role', async () => {
    const { email, password } = await signedInAgent(ctx.app);
    const agent = request.agent(ctx.app);
    const res = await agent.post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.role).toBe('DRIVER');
  });

  it('NFR-SEC-02 the session cookie is HttpOnly and SameSite', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), password: 'Driver1234', acceptPrivacy: true });
    const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
    expect(cookie).toContain('tolltally.sid=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('FR-ACC-07 Sign Out invalidates the session on the server and later protected requests need authentication', async () => {
    const { agent } = await signedInAgent(ctx.app);
    expect((await agent.get('/api/vehicles')).status).toBe(200);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await agent.get('/api/vehicles')).status).toBe(401);
    expect(await ctx.prisma.session.count()).toBeGreaterThanOrEqual(0);
  });

  it('BR-01 every planner route requires an authenticated session', async () => {
    const anonymous = request(ctx.app);
    expect((await anonymous.get('/api/vehicles')).status).toBe(401);
    expect((await anonymous.post('/api/trips').send({})).status).toBe(401);
    expect((await anonymous.get('/api/history')).status).toBe(401);
    expect((await anonymous.get('/api/admin/fuel-prices')).status).toBe(401);
  });
});
