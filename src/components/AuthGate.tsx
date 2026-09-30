import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Loader2, LockKeyhole, LogOut, ShieldAlert } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { buttonClass, Loading } from './ui.tsx';

const MIN_PASSWORD = 10;

/** Maps Convex Auth / ConvexError failures to messages that don't leak who has an account. */
function friendlyError(err: unknown, flow: 'signIn' | 'signUp'): string {
  const raw = err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err);
  if (/not allowed to access/i.test(raw)) return 'This email is not allowed to access the M2D dashboard. Ask an admin to add it.';
  if (/TooManyFailedAttempts|rate limit/i.test(raw)) return 'Too many failed attempts. Please wait a while and try again.';
  if (/Password must/i.test(raw)) return raw.match(/Password must[^.]*\./)?.[0] ?? raw;
  if (/already exists/i.test(raw)) return 'An account with this email already exists. Sign in instead.';
  if (/InvalidSecret|InvalidAccountId|Invalid credentials/i.test(raw) || flow === 'signIn') return 'Incorrect email or password.';
  return 'Could not create the account. Please try again.';
}

function Brand() {
  return (
    <div className="mb-8 flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-ink">V</span>
      <div className="leading-tight">
        <p className="font-semibold">M2D WhatsApp Agent</p>
        <p className="text-xs text-ink-3">Vyapar · Mobile → Desktop</p>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20';

export function SignInPage() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (flow === 'signUp' && (password.length < MIN_PASSWORD || !/[a-zA-Z]/.test(password) || !/\d/.test(password))) {
      setError(`Password must be at least ${MIN_PASSWORD} characters and contain letters and numbers.`);
      return;
    }
    setBusy(true);
    try {
      await signIn('password', { email: email.trim(), password, flow });
    } catch (err) {
      setError(friendlyError(err, flow));
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Brand />
        <h1 className="text-2xl font-semibold tracking-tight">{flow === 'signIn' ? 'Sign in' : 'Create your account'}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {flow === 'signIn' ? 'Access is limited to approved Vyapar team members.' : 'Only emails approved by an admin can create an account.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Email</span>
            <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Password</span>
            <input
              className={inputCls}
              type="password"
              autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {flow === 'signUp' && <span className="mt-1 block text-xs text-ink-3">At least {MIN_PASSWORD} characters, with letters and numbers.</span>}
          </label>
          {error && (
            <p role="alert" className="rounded-lg border border-critical/30 bg-critical/5 px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !email || !password} className={buttonClass('primary', 'w-full py-2.5')}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
            {flow === 'signIn' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-2">
          {flow === 'signIn' ? 'First time here?' : 'Already have an account?'}{' '}
          <button
            type="button"
            className="font-medium text-brand hover:underline"
            onClick={() => {
              setFlow(flow === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
            }}
          >
            {flow === 'signIn' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

function NoAccess({ email }: { email: string | null }) {
  const { signOut } = useAuthActions();
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-critical/10 text-critical">
          <ShieldAlert size={22} />
        </div>
        <h1 className="text-xl font-semibold">No access</h1>
        <p className="mt-2 text-sm text-ink-2">
          {email ?? 'This account'} is not on the list of approved dashboard users. Ask an admin to add it.
        </p>
        <button onClick={() => void signOut()} className={buttonClass('secondary', 'mt-6')}>
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}

/** Nothing inside renders (or queries data) until the user is signed in AND allowlisted. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : 'skip');

  if (isLoading) return <Loading label="Checking your session…" />;
  if (!isAuthenticated) return <SignInPage />;
  if (viewer === undefined) return <Loading label="Checking your session…" />;
  if (viewer === null) return <SignInPage />;
  if (!viewer.allowed) return <NoAccess email={viewer.email} />;
  return <>{children}</>;
}
