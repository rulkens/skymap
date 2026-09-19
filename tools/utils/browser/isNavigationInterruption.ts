/**
 * Did an evaluate/wait die because the page navigated out from under it?
 * Playwright reports that as 'Execution context was destroyed, most likely
 * because of a navigation' (waitForFunction variants mention the navigation
 * too).
 */
export function isNavigationInterruption(err: unknown): boolean {
  return (
    err instanceof Error &&
    /execution context was destroyed|because of a navigation/i.test(err.message)
  );
}
