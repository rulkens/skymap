import { delay } from '../utils/async/delay';
import type { CdpClient } from './@types/CdpClient';
import type { PhoneArgs } from './@types/PhoneArgs';
import { attachPhoneTab } from './attachPhoneTab';
import { linkUrl } from './linkUrl';
import { loadUrl } from './loadUrl';
import { readLastTarget } from './readLastTarget';
import { serverOrigin } from './serverOrigin';
import { withPhone } from './withPhone';

const SETTLE_AFTER_OPEN_MS = 10_000;

/** Run `fn` on the tab input goes to: a new tab at the link (after `--wait`), else the last tab the tool used. */
export async function withInputTab(
  args: PhoneArgs,
  fn: (client: CdpClient, sessionId: string) => Promise<void>,
): Promise<void> {
  await withPhone(async (client) => {
    if (args.link !== undefined) {
      const tab = await attachPhoneTab(client, undefined);
      await loadUrl(client, tab.sessionId, linkUrl(serverOrigin(args), args.link));
      await delay(args.waitMs ?? SETTLE_AFTER_OPEN_MS);
      return fn(client, tab.sessionId);
    }
    const tab = await attachPhoneTab(client, readLastTarget());
    if (tab.fresh) throw new Error('no tab to act on: give a link, or `open` one first');
    await delay(args.waitMs ?? 0);
    return fn(client, tab.sessionId);
  });
}
