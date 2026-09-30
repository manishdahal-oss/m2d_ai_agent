/**
 * Convex client + typed helpers for the dashboard.
 * Only the public deployment URL is in the browser (VITE_CONVEX_URL); secrets live in
 * Convex environment variables and never reach the client.
 */
import { ConvexReactClient, useConvex } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { useQuery as useTanstackQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../../convex/_generated/api';

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) throw new Error('VITE_CONVEX_URL is not set. Run `npx convex dev` once to create .env.local.');
export const convex = new ConvexReactClient(url);

export type CustomerListItem = FunctionReturnType<typeof api.customers.list>['page'][number];
export type CustomerDetail = NonNullable<FunctionReturnType<typeof api.customers.get>>;
export type DetailConversation = CustomerDetail['conversations'][number];
export type ThreadMessage = DetailConversation['messages'][number];
export type ConversationListItem = FunctionReturnType<typeof api.conversations.list>['page'][number];
export type Campaign = NonNullable<FunctionReturnType<typeof api.campaigns.get>>;
export type Settings = FunctionReturnType<typeof api.settings.get>;
export type AnalyticsFilters = FunctionArgs<typeof api.analytics.compute>;

/**
 * Analytics is a Convex *action* (it scans tables), so it isn't reactive.
 * Cache it with TanStack Query and refresh on an interval.
 */
export function useAnalytics(filters: AnalyticsFilters, refetchInterval = 30_000) {
  const client = useConvex();
  return useTanstackQuery({
    queryKey: ['analytics', filters],
    queryFn: () => client.action(api.analytics.compute, filters),
    placeholderData: keepPreviousData,
    refetchInterval,
  });
}
