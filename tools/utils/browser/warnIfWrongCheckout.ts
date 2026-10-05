import type { Page } from '@playwright/test';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';
import { PROJECT_ROOT } from '../io/projectRoot';
import { checkoutMismatch } from '../serve/checkoutMismatch';

/** Stderr only: perf's --json and shot's stdout paths must stay clean. */
export async function warnIfWrongCheckout(page: Page): Promise<void> {
  const serverRoot = await page.evaluate(
    () => (window as SkymapWindow).__skymap?.projectRoot ?? '',
  );
  const warning = checkoutMismatch(serverRoot, PROJECT_ROOT);
  if (warning !== null) console.warn(warning);
}
