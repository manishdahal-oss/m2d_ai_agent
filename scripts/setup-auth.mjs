#!/usr/bin/env node
/**
 * One-time Convex Auth setup for a deployment:
 *   - generates an RS256 key pair and sets JWT_PRIVATE_KEY + JWKS
 *   - sets SITE_URL (where the dashboard runs)
 *   - optionally sets ALLOWED_EMAILS
 *
 * The private key is passed straight to `convex env set` and never written to disk.
 *
 *   node scripts/setup-auth.mjs --site-url http://localhost:5180 --allow you@example.com
 *   node scripts/setup-auth.mjs --rotate     # replace existing keys (signs everyone out)
 */
import { execFileSync } from 'node:child_process';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const siteUrl = flag('--site-url') ?? 'http://localhost:5180';
const allow = flag('--allow');
const rotate = args.includes('--rotate');

const convex = (...a) => execFileSync('npx', ['convex', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const setEnv = (name, value) => convex('env', 'set', name, '--', value);

const existing = convex('env', 'list');
if (/^JWT_PRIVATE_KEY=/m.test(existing) && !rotate) {
  console.log('JWT keys already set — leaving them (use --rotate to replace; this signs everyone out).');
} else {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const jwk = await exportJWK(keys.publicKey);
  setEnv('JWT_PRIVATE_KEY', privateKey.trimEnd().replace(/\n/g, ' '));
  setEnv('JWKS', JSON.stringify({ keys: [{ use: 'sig', ...jwk }] }));
  console.log(rotate ? 'Rotated JWT keys.' : 'Set JWT_PRIVATE_KEY and JWKS.');
}

setEnv('SITE_URL', siteUrl);
console.log(`Set SITE_URL=${siteUrl}`);

if (allow) {
  setEnv('ALLOWED_EMAILS', allow);
  console.log(`Set ALLOWED_EMAILS=${allow}`);
} else if (!/^ALLOWED_EMAILS=/m.test(existing) && !/^ALLOWED_EMAIL_DOMAINS=/m.test(existing)) {
  console.log('No allowlist set yet — nobody can sign in. Run with --allow you@example.com');
}
