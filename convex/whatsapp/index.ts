/**
 * Provider selection. The rest of the app calls getWhatsAppProvider() and never imports a
 * concrete provider, so switching or adding providers doesn't touch campaign/AI code.
 */
import { timesConfig, timesSendingMissing } from '../lib/config';
import { ProviderNotConfiguredError, type WhatsAppProvider } from './provider';
import { TimesProvider } from './times';

export function getWhatsAppProvider(): WhatsAppProvider {
  const missing = timesSendingMissing();
  if (missing.length) throw new ProviderNotConfiguredError(missing);
  const t = timesConfig();
  return new TimesProvider({ apiUrl: t.apiUrl, apiKey: t.apiKey });
}
