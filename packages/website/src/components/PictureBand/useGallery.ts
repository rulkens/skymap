/*
 * useGallery — the state of a band of several views. Every view is rendered by
 * the server and only the current one shows; this chooses it. Left alone the
 * band moves on by itself, slowly; a choice starts the wait again, and the band
 * waits while the reader is at the markers. A later view is kept out of the
 * first load until `warmed` says the browser may fetch it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { GalleryState } from '../../@types/GalleryState';
import type { GalleryView } from '../../@types/GalleryView';
import { wrapIndex } from '../../utils/wrapIndex.ts';

// Long enough to read a label through before its picture goes.
const REST_SEC = 9;

export type Gallery = GalleryState & {
  /** The band's section, for the pointer and focus that warm the next view. */
  root: RefObject<HTMLElement | null>;
  /** One element per view, holding its picture. */
  layers: RefObject<(HTMLElement | null)[]>;
  /** Whether view `i` may be fetched. */
  warmed: (i: number) => boolean;
};

export function useGallery(views: readonly GalleryView[]): Gallery {
  const count = views.length;
  const [at, setAt] = useState(0);
  const [live, setLive] = useState(false);
  const [byReader, setByReader] = useState(false);
  const [warm, setWarm] = useState<ReadonlySet<number>>(() => new Set([0]));
  const root = useRef<HTMLElement>(null);
  const layers = useRef<(HTMLElement | null)[]>([]);
  const marksRef = useRef<HTMLDivElement>(null);
  const current = useRef(0);
  const rested = useRef(0);
  const saving = useRef(false);

  const warmFrom = useCallback(
    (view: number) =>
      setWarm((before) => {
        const next = new Set(before).add(wrapIndex(view, count));
        return next.size === before.size ? before : next;
      }),
    [count],
  );
  // One view ahead and no more; a reader who asked to save data fetches only the views they choose.
  const warmNext = useCallback(() => {
    if (!saving.current) warmFrom(current.current + 1);
  }, [warmFrom]);

  const show = useCallback(
    (view: number, chosen: boolean) => {
      current.current = wrapIndex(view, count);
      setAt(current.current);
      setByReader(chosen);
      warmFrom(current.current);
      warmNext();
    },
    [count, warmFrom, warmNext],
  );
  const choose = useCallback(
    (view: number) => {
      rested.current = 0;
      show(view, true);
    },
    [show],
  );

  useEffect(() => {
    setLive(true);
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    saving.current = connection?.saveData === true;
    const band = root.current!;

    band.addEventListener('pointerenter', warmNext, { once: true });
    band.addEventListener('focusin', warmNext, { once: true });
    const whenIdle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 2000));
    const idle = (): void => void whenIdle(warmNext);
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });

    const waiting = (): boolean =>
      document.hidden ||
      // Only the markers hold it: a band fills the first screen, so the pointer is nearly always over it.
      Boolean(marksRef.current?.matches(':hover, :focus-within')) ||
      band.getBoundingClientRect().bottom <= 0 ||
      ![
        ...(layers.current[wrapIndex(current.current + 1, count)]?.querySelectorAll('img') ?? []),
      ].every((img) => img.complete && img.naturalWidth > 0);
    // Counted in seconds of rest, so the wait starts again whenever the reader leaves the band alone.
    const clock = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? undefined
      : setInterval(() => {
          rested.current = waiting() ? 0 : rested.current + 1;
          if (rested.current < REST_SEC) return;
          rested.current = 0;
          show(current.current + 1, false);
        }, 1000);
    return () => {
      clearInterval(clock);
      band.removeEventListener('pointerenter', warmNext);
      band.removeEventListener('focusin', warmNext);
      window.removeEventListener('load', idle);
    };
  }, [count, show, warmNext]);

  return {
    views,
    at,
    live,
    byReader,
    choose,
    marksRef,
    root,
    layers,
    warmed: (i) => warm.has(i),
  };
}
