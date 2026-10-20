import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      SESSION_SECRET: 'test-only-session-secret',
      ROUTING_PROVIDER: 'mock',
      PARKING_PROVIDER: 'table',
    },
  },
});
