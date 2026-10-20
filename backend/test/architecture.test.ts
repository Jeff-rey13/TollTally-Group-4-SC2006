import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..', 'src');
const TEST = __dirname;

function filesUnder(dir: string, extension = '.ts'): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, extension);
    return entry.name.endsWith(extension) ? [full] : [];
  });
}

function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
}

describe('Maintainability (SRS 5.7)', () => {
  it('NFR-MAI-01 NFR-MAI-02 the calculation module imports no framework, database or provider code', () => {
    const forbidden = [
      'express',
      'express-session',
      '@prisma/client',
      'supertest',
      'node:fs',
      'node:http',
    ];
    const offences: string[] = [];
    for (const file of filesUnder(path.join(SRC, 'domain'))) {
      for (const specifier of importsOf(file)) {
        const reachesOut =
          forbidden.includes(specifier) ||
          specifier.includes('adapters') ||
          specifier.includes('modules') ||
          specifier.includes('/lib/') ||
          specifier.endsWith('/config');
        if (reachesOut) offences.push(`${path.basename(file)} imports ${specifier}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('NFR-MAI-01 only the adapters know which routing or parking provider is in use', () => {
    const providerNames = ['onemap.gov.sg', 'routes.googleapis.com', 'datamall'];
    const offences: string[] = [];
    for (const file of filesUnder(SRC)) {
      if (file.includes(path.join('src', 'adapters'))) continue;
      const source = fs.readFileSync(file, 'utf8').toLowerCase();
      for (const name of providerNames) {
        if (source.includes(name)) offences.push(`${path.relative(SRC, file)} mentions ${name}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('NFR-MAI-03 the automated tests cover each case the SRS names', () => {
    const cases = [
      'normal',
      'rate-boundary',
      'zero-charge',
      'missing-rate',
      'zero-top-up',
      'insufficient-fuel',
      'overlapping-rate',
      'route-range-overlap',
      'history-aggregation',
    ];
    const titles = filesUnder(TEST)
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n')
      .toLowerCase();
    const missing = cases.filter((name) => !titles.includes(name));
    expect(missing).toEqual([]);
  });

  it('NFR-MAI-04 one documented command runs the whole suite from a clean checkout', () => {
    const root = path.resolve(__dirname, '..', '..');
    const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(rootPackage.scripts.test).toBeDefined();

    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    expect(readme).toContain('npm run test:all');
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(workflow).toContain('npm run test:all');
    expect(rootPackage.scripts['test:all']).toBe('npm test && npm run test:e2e');
  });
});
