const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '..');
const env = path.join(dir, '.env');
const example = path.join(dir, '.env.example');

if (!fs.existsSync(env) && fs.existsSync(example)) {
  fs.copyFileSync(example, env);
  console.log('[tolltally] created backend/.env from backend/.env.example');
}
