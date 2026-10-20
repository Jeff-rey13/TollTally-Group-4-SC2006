import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DATABASE_URL = 'file:./test.db';

export default function globalSetup(): void {
  const dbPath = path.resolve(process.cwd(), 'prisma', 'test.db');
  for (const file of [dbPath, `${dbPath}-journal`]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  fs.closeSync(fs.openSync(dbPath, 'a'));
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
