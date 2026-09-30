import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, isRouteErrorResponse, Link, RouterProvider, useRouteError } from 'react-router';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGate } from './components/AuthGate.tsx';
import { Layout } from './components/Layout.tsx';
import { EmptyState, ErrorState, Loading, buttonClass } from './components/ui.tsx';
import { convex } from './lib/convex.ts';
import { AnalyticsPage } from './pages/AnalyticsPage.tsx';
import { CampaignDetailPage, CampaignsPage } from './pages/CampaignsPage.tsx';
import { CampaignNewPage } from './pages/CampaignNewPage.tsx';
import { ConversationsPage } from './pages/ConversationsPage.tsx';
import { CustomerDetailPage } from './pages/CustomerDetailPage.tsx';
import { CustomersPage } from './pages/CustomersPage.tsx';
import { NeedsHumanPage } from './pages/NeedsHumanPage.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import './styles.css';

// The CSV importer pulls in phone-number metadata + the CSV parser; load it only when needed.
const CustomerImportPage = lazy(() => import('./pages/CustomerImportPage.tsx').then((m) => ({ default: m.CustomerImportPage })));

// Convex queries are live subscriptions; TanStack Query only caches the analytics *action*.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true } },
});

/** Convex query errors (e.g. a malformed id in the URL) are thrown during render and land here. */
function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? error.statusText : error instanceof Error ? error.message : String(error);
  const invalidId = /ArgumentValidationError|Value does not match validator|Invalid argument/i.test(message);
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {invalidId ? (
        <EmptyState title="Not found">
          This link doesn't point to a valid record.
          <Link to="/" className={buttonClass('secondary', 'mt-3')}>
            Back to overview
          </Link>
        </EmptyState>
      ) : (
        <ErrorState error={new Error(message)} />
      )}
    </div>
  );
}

function NotFound() {
  return (
    <EmptyState title="Page not found">
      <Link to="/" className={buttonClass('secondary', 'mt-3')}>
        Back to overview
      </Link>
    </EmptyState>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        // Pathless boundary: errors render inside the layout, so navigation stays usable.
        errorElement: <RouteError />,
        children: [
          { path: '/', element: <OverviewPage /> },
          { path: '/customers', element: <CustomersPage /> },
          {
            path: '/customers/import',
            element: (
              <Suspense fallback={<Loading />}>
                <CustomerImportPage />
              </Suspense>
            ),
          },
          { path: '/customers/:id', element: <CustomerDetailPage /> },
          { path: '/campaigns', element: <CampaignsPage /> },
          { path: '/campaigns/new', element: <CampaignNewPage /> },
          { path: '/campaigns/:id', element: <CampaignDetailPage /> },
          { path: '/conversations', element: <ConversationsPage /> },
          { path: '/needs-human', element: <NeedsHumanPage /> },
          { path: '/analytics', element: <AnalyticsPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Convex Auth: session tokens are attached to every query/mutation/action automatically. */}
    <ConvexAuthProvider client={convex}>
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <RouterProvider router={router} />
        </AuthGate>
      </QueryClientProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);
