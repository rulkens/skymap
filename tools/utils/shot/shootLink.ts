import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Browser } from '@playwright/test';
import { bootHookedPage } from '../browser/bootHookedPage';
import { collectPageErrors } from '../browser/collectPageErrors';
import { dispatchActions } from '../browser/dispatchActions';
import { warnIfWrongCheckout } from '../browser/warnIfWrongCheckout';
import { readCanvas } from '../browser/readCanvas';
import { labelDeclutterActions } from '../capture/labelDeclutterActions';
import { SHOT_JPEG_QUALITY } from './SHOT_JPEG_QUALITY';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';
import type { ShotLink } from '../../shot/@types/ShotLink';
import type { ShotOptions } from '../../shot/@types/ShotOptions';
import type { ShotOutcome } from '../../shot/@types/ShotOutcome';

const TIMED_OUT = Symbol('timedOut');

/**
 * shootLink — boot one deep link in its own context and screenshot whatever is
 * on screen. A subject that never resolves or a boot that throws still yields a
 * image: a picture of the failure is more useful to a reader than none. The boot
 * catches its own errors, so a rejection landing after the timer won is never
 * unhandled.
 */
export async function shootLink(
  browser: Browser,
  base: string,
  link: ShotLink,
  opts: Pick<
    ShotOptions,
    'width' | 'height' | 'dpr' | 'hideUi' | 'hideLabels' | 'timeoutMs' | 'format'
  > & {
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
        }
        // Waits out label fades too, which a single frame after the dispatch would still show.
        await page.evaluate(() => (window as unknown as SkymapWindow).__skymap!.settled());
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
      let image: Buffer | undefined;
      // The canvas alone, so hidden UI leaves no chrome; only a booted page has the hook.
      if (opts.hideUi && !timedOut && error === null) {
        image = await readCanvas(page, opts.format).catch(() => undefined);
      }
      image ??= await page.screenshot({
        type: opts.format,
        ...(opts.format === 'jpeg' ? { quality: SHOT_JPEG_QUALITY } : {}),
        timeout: opts.timeoutMs,
      });
      path = resolve(opts.outPath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, image);
    } catch (err) {
      path = null;
      error ??= err instanceof Error ? err.message : String(err);
    }
    return { path, timedOut, error, pageErrors };
  } finally {
    await context.close();
  }
}
