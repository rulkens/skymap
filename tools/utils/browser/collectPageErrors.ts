/**
 * Attach `pageerror` + `console.error` listeners to `page` and return the
 * array they fill as events fire — live, so callers read it AFTER the page
 * has run for a while, not right after this call.
 */
import type { Page } from '@playwright/test';

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}
