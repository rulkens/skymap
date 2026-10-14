import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CdpClient } from './@types/CdpClient';
import type { PhoneTab } from './@types/PhoneTab';
import { PHONE_PATHS } from './PHONE_PATHS';

/**
 * Attach to tab `targetId` when it is still open, else to a new blank tab,
 * and remember it as the tab later commands default to. Certificate errors
 * are ignored per tab, so the mkcert warning page never shows; the tab is
 * brought to front because a background tab draws no frames.
 */
export async function attachPhoneTab(
  client: CdpClient,
  targetId: string | undefined,
): Promise<PhoneTab> {
  const { targetInfos } = await client.call<{ targetInfos: { targetId: string }[] }>(
    'Target.getTargets',
  );
  const alive = targetId !== undefined && targetInfos.some((t) => t.targetId === targetId);
  const id = alive
    ? targetId
    : (await client.call<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }))
        .targetId;
  const { sessionId } = await client.call<{ sessionId: string }>('Target.attachToTarget', {
    targetId: id,
    flatten: true,
  });
  await client.call('Security.setIgnoreCertificateErrors', { ignore: true }, sessionId);
  await client.call('Page.enable', {}, sessionId);
  await client.call('Page.bringToFront', {}, sessionId).catch((err: unknown) => {
    console.error(`phone: could not bring tab ${id} to front (${String(err)})`);
  });
  mkdirSync(dirname(PHONE_PATHS.target), { recursive: true });
  writeFileSync(PHONE_PATHS.target, `${id}\n`);
  return { targetId: id, sessionId, fresh: !alive };
}
