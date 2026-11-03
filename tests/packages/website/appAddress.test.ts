/**
 * appAddress is the text a reader copies and pastes, so it must name the host on the dev server (where appLink
 * is already absolute) and in a build (where it is root-relative) alike, and never twice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const SITE = 'https://skymap.rulkens.com';

async function appAddressIn(mode: string) {
  vi.stubEnv('MODE', mode);
  vi.stubEnv('SITE', SITE);
  vi.resetModules();
  return (await import('../../../packages/website/src/utils/appAddress.ts')).appAddress;
}

describe('appAddress', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['development', 'production'])('is absolute on the site host in %s', async (mode) => {
    const appAddress = await appAddressIn(mode);
    expect(appAddress('focus=body-earth&t=2033-03-14', 'dome')).toBe(
      `${SITE}/?dome#focus=body-earth&t=2033-03-14`,
    );
    expect(appAddress()).toBe(`${SITE}/`);
  });
});
