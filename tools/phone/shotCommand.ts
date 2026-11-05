import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { delay } from '../utils/async/delay';
import type { PhoneArgs } from './@types/PhoneArgs';
import { attachPhoneTab } from './attachPhoneTab';
import { linkUrl } from './linkUrl';
import { loadUrl } from './loadUrl';
import { phoneShotName } from './phoneShotName';
import { readLastTarget } from './readLastTarget';
import { serverOrigin } from './serverOrigin';
import { withPhone } from './withPhone';

const SETTLE_AFTER_OPEN_MS = 10_000;
const SCREENSHOT_TIMEOUT_MS = 30_000;
const JPEG_QUALITY = 80;

/**
 * Screenshot the last tab, or a new tab at the link after `--wait` (default
 * 10 s, a phone's boot). The image is the compositor's, read without
 * `Runtime.evaluate`, which has hung on the phone; `__skymap.settled()` is
 * out of reach, so the wait is a plain timer.
 */
export async function shotCommand(args: PhoneArgs): Promise<void> {
  await withPhone(async (client) => {
    let pageUrl: string;
    let sessionId: string;
    if (args.link !== undefined) {
      pageUrl = linkUrl(serverOrigin(args), args.link);
      const tab = await attachPhoneTab(client, undefined);
      sessionId = tab.sessionId;
      await loadUrl(client, sessionId, pageUrl);
      await delay(args.waitMs ?? SETTLE_AFTER_OPEN_MS);
    } else {
      const last = readLastTarget();
      const tab = await attachPhoneTab(client, last);
      if (tab.fresh) throw new Error('no tab to shoot: give a link, or `open` one first');
      sessionId = tab.sessionId;
      const { targetInfo } = await client.call<{ targetInfo: { url: string } }>(
        'Target.getTargetInfo',
        { targetId: tab.targetId },
      );
      pageUrl = targetInfo.url;
      await delay(args.waitMs ?? 0);
    }
    const { data } = await client.call<{ data: string }>(
      'Page.captureScreenshot',
      { format: 'jpeg', quality: JPEG_QUALITY },
      sessionId,
      SCREENSHOT_TIMEOUT_MS,
    );
    const out = resolve(args.out ?? phoneShotName(pageUrl, new Date()));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(out);
  });
}
