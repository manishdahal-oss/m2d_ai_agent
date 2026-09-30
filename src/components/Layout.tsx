import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  FlaskConical,
  Headset,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessagesSquare,
  Moon,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { buttonClass } from './ui.tsx';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/conversations', label: 'Conversations', icon: MessagesSquare },
  { to: '/needs-human', label: 'Needs Human', icon: Headset, badge: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    if (dark) document.documentElement.dataset.theme = 'dark';
    else document.documentElement.dataset.theme = 'light';
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  }, [dark]);
  return [dark, () => setDark((d) => !d)] as const;
}

function Nav({ needsHuman, onNavigate }: { needsHuman: number; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-0.5 px-3">
      {NAV.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            }`
          }
        >
          <Icon size={17} aria-hidden />
          <span className="flex-1">{label}</span>
          {badge && needsHuman > 0 && (
            <span
              className="rounded-full bg-critical px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white tabular"
              aria-label={`${needsHuman} conversations need a human`}
            >
              {needsHuman}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-6 py-5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-ink">V</span>
      <div className="leading-tight">
        <p className="text-sm font-semibold">M2D WhatsApp Agent</p>
        <p className="text-[11px] text-ink-3">Vyapar · Mobile → Desktop</p>
      </div>
    </div>
  );
}

export function Layout() {
  const [dark, toggleTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Live subscriptions: the badge updates the moment a conversation needs a human.
  const needsHuman = useQuery(api.conversations.needsHumanCount);
  const campaigns = useQuery(api.campaigns.list);
  const settings = useQuery(api.settings.get);
  const viewer = useQuery(api.users.viewer);
  const { signOut } = useAuthActions();
  const queryClient = useQueryClient();
  const hasDemo = campaigns?.some((c) => c.isDemo);
  const waConfigured = settings?.whatsapp.sendingConfigured;
  const count = needsHuman?.count ?? 0;

  const handleSignOut = async () => {
    queryClient.clear(); // drop cached analytics so nothing lingers for the next person
    await signOut();
  };

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <Brand />
        <Nav needsHuman={count} />
        <div className="mt-auto space-y-3 border-t border-line px-4 pb-4 pt-3">
          {viewer?.email && (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-ink-2" title={viewer.email}>
                {viewer.email}
              </span>
              <button onClick={() => void handleSignOut()} className="rounded-lg p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Sign out" title="Sign out">
                <LogOut size={15} />
              </button>
            </div>
          )}
          <p className="px-0.5 text-[11px] text-ink-3">MVP · Phase 1–2 · Convex</p>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <Nav needsHuman={count} onNavigate={() => setOpen(false)} />
            {viewer?.email && (
              <div className="mt-auto flex items-center gap-2 border-t border-line px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{viewer.email}</span>
                <button onClick={() => void handleSignOut()} className={buttonClass('ghost', 'px-2 py-1.5 text-xs')}>
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/85 px-4 py-2.5 backdrop-blur sm:px-6">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Open menu">
            <Menu size={18} />
          </button>
          <span className="text-sm font-semibold lg:hidden">M2D WhatsApp Agent</span>
          <div className="ml-auto flex items-center gap-2">
            {hasDemo && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2"
                title="Demo data is loaded. Remove it with: npm run demo:clear"
              >
                <FlaskConical size={13} className="text-serious" aria-hidden /> Demo data
              </span>
            )}
            {settings && (
              <NavLink
                to="/settings"
                className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:text-ink sm:inline-flex"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${waConfigured ? 'bg-good' : 'bg-warning'}`} aria-hidden />
                WhatsApp (Times): {waConfigured ? 'sending ready' : 'not connected'}
              </NavLink>
            )}
            <button onClick={toggleTheme} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
