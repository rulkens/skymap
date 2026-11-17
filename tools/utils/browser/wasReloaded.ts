import type { Page } from '@playwright/test';

/** True once the page's document is a reload of the one `goto` opened, not that document. */
export function wasReloaded(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
        ?.type === 'reload',
  );
}
