/**
 * withTimeout — `work`, or a rejection naming `what` after `ms`. For browser
 * calls Playwright never times out itself (`newPage`, `evaluate`, `close`): a
 * Chromium whose GPU process wedges leaves them pending forever.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms / 1000} s`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
