import { useCallback, useRef, useState } from 'react';

import type { DocsReview } from '../../../../../tools/site/@types/DocsReview';

/**
 * The review file as the page holds it. `change` edits it and saves; saves go in order, and the newest
 * state is what each one sends, so a slower earlier request cannot land on top of a later one.
 */
export function useReviewFile(url: string, first: DocsReview) {
  const [review, setReview] = useState(first);
  const [saveFlag, setSaveFlag] = useState({ text: '', error: false });
  const latest = useRef(first);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const change = useCallback(
    (edit: (current: DocsReview) => DocsReview) => {
      latest.current = edit(latest.current);
      setReview(latest.current);
      setSaveFlag({ text: 'saving…', error: false });
      queue.current = queue.current.then(async () => {
        try {
          const res = await fetch(url, { method: 'PUT', body: JSON.stringify(latest.current) });
          if (!res.ok) throw new Error(String(res.status));
          setSaveFlag({ text: 'saved', error: false });
        } catch {
          setSaveFlag({ text: 'save failed', error: true });
        }
      });
    },
    [url],
  );

  // The agent's file is the newer one once it has carried out an apply: take it whole, marks included.
  const adopt = useCallback((fresh: DocsReview) => {
    const mine = latest.current;
    const carriedOut = (fresh.applied?.length ?? 0) > (mine.applied?.length ?? 0);
    latest.current = { ...mine, apply: undefined, ...(carriedOut ? fresh : {}) };
    setReview(latest.current);
  }, []);

  return { review, change, adopt, saveFlag };
}
