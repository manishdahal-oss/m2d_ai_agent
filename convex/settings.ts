import { authedQuery as query } from './lib/access';
import { LANGUAGES } from '../shared/languages';
import { VYAPAR_DESKTOP_KNOWLEDGE } from '../shared/knowledge/vyaparDesktop';
import { desktopDownloadUrl, eligibilityRules, engineConfig, nvidiaConfig, timesConfig, timesSendingMissing, timesWebhookMissing } from './lib/config';

/** Read-only settings for the dashboard. Booleans and public values only — never secrets. */
export const get = query({
  args: {},
  handler: async () => {
    const sendingMissing = timesSendingMissing();
    const webhookMissing = timesWebhookMissing();
    const nvidia = nvidiaConfig();
    const rules = eligibilityRules();
    return {
      database: { provider: 'convex' as const, url: process.env.CONVEX_CLOUD_URL ?? null },
      webhookBaseUrl: process.env.CONVEX_SITE_URL ?? null,
      whatsapp: {
        provider: 'times' as const,
        // Host only (public) — never the key.
        apiHost: sendingMissing.includes('TIMES_API_URL') ? null : new URL(timesConfig().apiUrl).host,
        sendingConfigured: sendingMissing.length === 0,
        sendingMissing,
        webhookConfigured: webhookMissing.length === 0,
        webhookMissing,
        webhookUrl: process.env.CONVEX_SITE_URL ? `${process.env.CONVEX_SITE_URL}/webhooks/whatsapp` : null,
      },
      engine: engineConfig(),
      llm: { provider: 'nvidia' as const, configured: !!nvidia.apiKey, model: nvidia.apiKey ? nvidia.model : null },
      eligibility: { excludedAssigneePattern: rules.excludedAssigneePattern, desktopActiveValues: [...rules.desktopActiveValues] },
      desktopDownloadUrl: desktopDownloadUrl(),
      languages: LANGUAGES.map(({ code, name, nativeName, enabled }) => ({ code, name, nativeName, enabled })),
      knowledge: VYAPAR_DESKTOP_KNOWLEDGE,
    };
  },
});
