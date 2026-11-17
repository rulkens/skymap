import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import { bootHookedPage } from '../../../../tools/utils/browser/bootHookedPage';

/** A page whose documents report `reloaded[i]` as their navigation type, one per goto of the link. */
function fakePage(reloaded: boolean[]) {
  const gotos: string[] = [];
  let opened = -1;
  const page = {
    goto: vi.fn(async (url: string) => {
      gotos.push(url);
      if (url !== 'about:blank') opened++;
    }),
    waitForFunction: vi.fn(async () => undefined),
    evaluate: vi.fn(async (fn: () => unknown) =>
      // wasReloaded reads the navigation type; the ready wait returns nothing.
      String(fn).includes('navigation') ? reloaded[opened] : undefined,
    ),
  };
  return { page: page as unknown as Page, gotos };
}

describe('bootHookedPage', () => {
  it('opens the link again, via a blank page, when the booted document is a reload', async () => {
    const { page, gotos } = fakePage([true, false]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await bootHookedPage(page, 'http://x/#pose=1');
    expect(gotos).toEqual(['http://x/#pose=1', 'about:blank', 'http://x/#pose=1']);
  });

  it('gives up when the page keeps reloading', async () => {
    const { page } = fakePage([true, true, true, true]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(bootHookedPage(page, 'http://x/')).rejects.toThrow(/kept reloading/);
  });
});
