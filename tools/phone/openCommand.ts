import type { PhoneArgs } from './@types/PhoneArgs';
import { attachPhoneTab } from './attachPhoneTab';
import { linkUrl } from './linkUrl';
import { loadUrl } from './loadUrl';
import { serverOrigin } from './serverOrigin';
import { withPhone } from './withPhone';

export async function openCommand(args: PhoneArgs): Promise<void> {
  if (args.link === undefined) throw new Error('open needs a link');
  const url = linkUrl(serverOrigin(args), args.link);
  await withPhone(async (client) => {
    const tab = await attachPhoneTab(client, undefined);
    await loadUrl(client, tab.sessionId, url);
    console.log(`opened ${url} as tab ${tab.targetId}`);
  });
}
