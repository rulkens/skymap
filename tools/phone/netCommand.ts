import { delay } from '../utils/async/delay';
import type { DataRequest } from './@types/DataRequest';
import type { NetEventParams } from './@types/NetEventParams';
import type { PhoneArgs } from './@types/PhoneArgs';
import { attachPhoneTab } from './attachPhoneTab';
import { linkUrl } from './linkUrl';
import { loadUrl } from './loadUrl';
import { readLastTarget } from './readLastTarget';
import { serverOrigin } from './serverOrigin';
import { tabulateDataRequests } from './tabulateDataRequests';
import { withPhone } from './withPhone';

const DEFAULT_FOR_MS = 15_000;
const CONSOLE_LINES = 20;
const MESSAGE_CHARS = 300;

/**
 * Cold-load the last tab (at the link, when given) with the cache off, then
 * tabulate the `/data/` requests and the console errors and warnings seen in
 * `--for` ms. Listening is all events: `Runtime.enable` only subscribes, it
 * evaluates nothing on the phone.
 */
export async function netCommand(args: PhoneArgs): Promise<void> {
  await withPhone(async (client) => {
    const tab = await attachPhoneTab(client, readLastTarget());
    if (tab.fresh && args.link === undefined) throw new Error('no tab to reload: give a link');
    const requests = new Map<string, DataRequest>();
    const consoleLines: string[] = [];
    client.onEvent(({ method, params, sessionId }) => {
      if (sessionId !== tab.sessionId) return;
      const p = params as NetEventParams;
      const request = requests.get(p.requestId);
      if (method === 'Network.requestWillBeSent') requests.set(p.requestId, { url: p.request.url });
      else if (method === 'Network.responseReceived' && request) {
        request.status = p.response.status;
        request.mimeType = p.response.mimeType;
      } else if (method === 'Network.loadingFinished' && request)
        request.bytes = p.encodedDataLength;
      else if (method === 'Network.loadingFailed' && request) request.failed = p.errorText;
      else if (method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(p.type)) {
        const text = p.args.map((a) => String(a.value ?? a.description ?? '')).join(' ');
        consoleLines.push(`${p.type}: ${text.slice(0, MESSAGE_CHARS)}`);
      } else if (method === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails;
        consoleLines.push(
          `exception: ${(d.exception?.description ?? d.text).slice(0, MESSAGE_CHARS)}`,
        );
      }
    });
    await client.call('Network.enable', {}, tab.sessionId);
    await client.call('Network.setCacheDisabled', { cacheDisabled: true }, tab.sessionId);
    await client.call('Runtime.enable', {}, tab.sessionId);
    consoleLines.length = 0; // Runtime.enable replays the old page's console
    if (args.link !== undefined)
      await loadUrl(client, tab.sessionId, linkUrl(serverOrigin(args), args.link));
    else await client.call('Page.reload', { ignoreCache: true }, tab.sessionId);
    await delay(args.forMs ?? DEFAULT_FOR_MS);

    console.log('data requests by dir/status:');
    for (const row of tabulateDataRequests(requests.values())) {
      const mb = (row.bytes / 1e6).toFixed(1);
      console.log(
        `  ${String(row.count).padStart(5)}  ${mb.padStart(7)} MB  ${row.dir} ${row.outcome}`,
      );
    }
    console.log(`console (${consoleLines.length}):`);
    for (const line of consoleLines.slice(0, CONSOLE_LINES)) console.log(`  ${line}`);
  });
}
