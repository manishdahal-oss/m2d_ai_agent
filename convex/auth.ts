/**
 * Dashboard authentication (Convex Auth, email + password).
 *
 * Invite-only: every flow (sign up, sign in, reset) is checked against the allowlist in
 * ALLOWED_EMAILS / ALLOWED_EMAIL_DOMAINS. Access is re-checked on every function call
 * (convex/lib/access.ts), so removing someone from the list revokes access immediately.
 * Failed password attempts are rate-limited by Convex Auth.
 */
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import { isEmailAllowed, normalizeEmail } from '../shared/access';
import { allowList } from './lib/config';

export const MIN_PASSWORD_LENGTH = 10;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = typeof params.email === 'string' ? normalizeEmail(params.email) : '';
        if (!isEmailAllowed(email, allowList())) {
          // Same message whether or not an account exists — don't leak who has access.
          throw new ConvexError('This email is not allowed to access the M2D dashboard.');
        }
        return { email };
      },
      validatePasswordRequirements(password) {
        if (password.length < MIN_PASSWORD_LENGTH) throw new ConvexError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) throw new ConvexError('Password must contain letters and numbers.');
      },
    }),
  ],
});
