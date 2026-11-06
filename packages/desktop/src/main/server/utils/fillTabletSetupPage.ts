import { APP_SERVER_PORT } from '../../../data/appServerPort';
import { pairingUrl } from '../../../../../../src/utils/remote/pairingUrl';

const FILLS: Record<string, string> = {
  __APP_PORT__: String(APP_SERVER_PORT),
  // The remote's path up to the code, as the one function that spells it builds it.
  __REMOTE_PATH__: pairingUrl('', ''),
};

/** assets/tablet-setup.html with the app's port and the remote's path filled in; throws on a lost placeholder. */
export function fillTabletSetupPage(template: string): Buffer {
  let page = template;
  for (const [mark, value] of Object.entries(FILLS)) {
    if (!page.includes(mark)) throw new Error(`tablet-setup.html has no ${mark}`);
    page = page.replaceAll(mark, value);
  }
  return Buffer.from(page);
}
