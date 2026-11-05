import type { CdpClient } from './@types/CdpClient';

const NAVIGATE_TIMEOUT_MS = 30_000;

/**
 * Navigate the tab to `url` as a full page load. Going through about:blank
 * first matters: a link that differs from the tab's URL only in its hash
 * would otherwise be a same-document navigation, with no reload at all.
 */
export async function loadUrl(client: CdpClient, sessionId: string, url: string): Promise<void> {
  await client.call('Page.navigate', { url: 'about:blank' }, sessionId, NAVIGATE_TIMEOUT_MS);
  await client.call('Page.navigate', { url }, sessionId, NAVIGATE_TIMEOUT_MS);
}
