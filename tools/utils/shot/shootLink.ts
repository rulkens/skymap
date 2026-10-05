import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Browser } from '@playwright/test';
import { bootHookedPage } from '../browser/bootHookedPage';
import { collectPageErrors } from '../browser/collectPageErrors';
import { dispatchActions } from '../browser/dispatchActions';
import { warnIfWrongCheckout } from '../browser/warnIfWrongCheckout';
import { FADE_OUT_DURATION_MS } from '../../../src/services/animation/fadeController';
import { labelDeclutterActions } from '../capture/labelDeclutterActions';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';
import type { ShotLink } from '../../shot/@types/ShotLink';
import type { ShotOptions } from '../../shot/@types/ShotOptions';
import type { ShotOutcome } from '../../shot/@types/ShotOutcome';

const TIMED_OUT = Symbol('timedOut');

/**
 * shootLink — boot one deep link in its own context and screenshot whatever is
 * on screen. A subject that never resolves or a boot that throws still yields a
 * PNG: a picture of the failure is more useful to a reader than none. The boot
 * catches its own errors, so a rejection landing after the timer won is never
 * unhandled.
 */
export async function shootLink(
  browser: Browser,
  base: string,
  link: ShotLink,
  opts: Pick<ShotOptions, 'width' | 'height' | 'dpr' | 'hideUi' | 'hideLabels' | 'timeoutMs'> & {
    outPath: string;
  },
): Promise<ShotOutcome> {
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.dpr,
  });
  try {
    const page = await context.newPage();
    const pageErrors = collectPageErrors(page);
    const params = new URLSearchParams(link.search);
    if (opts.hideUi && !params.has('cinema')) params.set('cinema', '');
    const search = params.toString().replace(/=(&|$)/g, '$1');
    const url = `${base}/${search === '' ? '' : `?${search}`}#${link.hash}`;

    const boot = (async (): Promise<string | null> => {
      try {
        await bootHookedPage(page, url);
        await warnIfWrongCheckout(page);
        if (opts.hideLabels) {
          await dispatchActions(page, labelDeclutterActions());
          // Labels fade out after the dispatch; the next frame would still show them.
          await page.waitForTimeout(FADE_OUT_DURATION_MS);
        }
        await page.evaluate(() => (window as unknown as SkymapWindow).__skymap!.nextFrame());
        return null;
      } catch (err) {
        return (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      }
    })();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<typeof TIMED_OUT>((res) => {
      timer = setTimeout(() => res(TIMED_OUT), opts.timeoutMs);
    });
    const raced = await Promise.race([boot, deadline]);
    clearTimeout(timer);
    const timedOut = raced === TIMED_OUT;
    let error = timedOut ? null : raced;

    let path: string | null = null;
    try {
      const png = await page.screenshot({ type: 'png', timeout: opts.timeoutMs });
      path = resolve(opts.outPath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, png);
    } catch (err) {
      path = null;
      error ??= err instanceof Error ? err.message : String(err);
    }
    return { path, timedOut, error, pageErrors };
  } finally {
    await context.close();
  }
}
