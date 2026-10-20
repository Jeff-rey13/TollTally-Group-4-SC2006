const fs = require('node:fs');
const path = require('node:path');

const envFile = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.DATABASE_URL || 'file:./dev.db';
if (!url.startsWith('file:')) throw new Error('This build requires a SQLite database URL.');
const databasePath = path.resolve(__dirname, '..', 'prisma', url.slice(5));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.closeSync(fs.openSync(databasePath, 'a'));
