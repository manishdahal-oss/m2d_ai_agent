/**
 * Guard: public Convex functions must use the authenticated builders from lib/access.ts.
 * Fails if any module imports the raw `query` / `mutation` / `action` builders — which would
 * create an endpoint callable by anyone who knows the deployment URL.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = dirname(fileURLToPath(import.meta.url));

// Files allowed to use raw builders, and why.
const ALLOWED: Record<string, string> = {
  'users.ts': 'viewer returns only the caller’s own email (needed before access is known)',
  'lib/access.ts': 'defines the authenticated builders',
  'whatsapp/webhook.ts': 'public by design (Times calls it); optional shared secret; only records events + schedules internal work',
};

function convexModules(dir = DIR, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === '_generated' || e.name === 'node_modules') return [];
    if (e.isDirectory()) return convexModules(join(dir, e.name), `${prefix}${e.name}/`);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [`${prefix}${e.name}`] : [];
  });
}

describe('public function guard', () => {
  it('no module imports raw query/mutation/action builders', () => {
    const offenders = convexModules().filter((file) => {
      if (ALLOWED[file]) return false;
      const src = readFileSync(join(DIR, file), 'utf8');
      const m = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\.?\/?(\.\.\/)?_generated\/server['"]/);
      if (!m) return false;
      return m[1]
        .split(',')
        .map((s) => s.trim().replace(/^type\s+/, ''))
        .some((name) => ['query', 'mutation', 'action', 'httpAction'].includes(name.split(/\s+as\s+/)[0]) && !m[1].includes(`type ${name}`));
    });
    expect(offenders).toEqual([]);
  });

  it('scans a meaningful set of modules', () => {
    expect(convexModules()).toEqual(expect.arrayContaining(['customers.ts', 'conversations.ts', 'campaigns.ts', 'analytics.ts', 'settings.ts']));
  });
});
