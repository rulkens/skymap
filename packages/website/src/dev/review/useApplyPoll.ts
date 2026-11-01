import { useEffect } from 'react';

import type { DocsReview } from '../../../../../tools/site/@types/DocsReview';

const POLL_MS = 3000;

/**
 * While an apply is requested, asks the review file whether the agent that watches it has finished
 * (it removes `apply` once the page is edited) and hands over the file when it has.
 */
export function useApplyPoll(
  url: string,
  applying: boolean,
  onFinished: (fresh: DocsReview) => void,
): void {
  useEffect(() => {
    if (!applying) return;
    const poll = window.setInterval(async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const fresh = (await res.json()) as DocsReview;
        if (fresh.apply) return;
        window.clearInterval(poll);
        onFinished(fresh);
      } catch {
        /* server restarting: the next tick asks again */
      }
    }, POLL_MS);
    return () => window.clearInterval(poll);
  }, [url, applying, onFinished]);
}
