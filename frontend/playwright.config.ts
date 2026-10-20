import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  workers: 1,
  use: {
    baseURL: 'http://localhost:5417',
    trace: 'retain-on-failure',
    // Start every test with the cookie notice already closed so it never covers a control.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:5417',
          localStorage: [{ name: 'tolltally.cookie-notice', value: '1' }],
        },
      ],
    },
  },
  webServer: [
    {
      command: 'npm run test:serve -w backend',
      cwd: '..',
      url: 'http://localhost:3417/api/health',
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: '3417',
        DATABASE_URL: 'file:./e2e.db',
        ROUTING_PROVIDER: 'mock',
        PARKING_PROVIDER: 'table',
        SESSION_SECRET: 'isolated-browser-test-secret',
        ADMIN_EMAIL: 'admin@tolltally.local',
        ADMIN_PASSWORD: 'Admin1234',
        RATE_LIMITS: 'off',
      },
      timeout: 180_000,
    },
    {
      command: 'npm run dev -w frontend -- --port 5417',
      cwd: '..',
      url: 'http://localhost:5417',
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://localhost:3417' },
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    {
      name: 'phone-360',
      use: { browserName: 'chromium', viewport: { width: 360, height: 740 }, isMobile: true },
    },
  ],
});
