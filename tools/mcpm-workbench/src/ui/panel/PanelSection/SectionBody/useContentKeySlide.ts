/**
 * useContentKeySlide — when `contentKey` changes, grows or shrinks the body from the height it
 * had at the last commit to the new content's, in the reveal's own timing; with reduced motion
 * the sections below jump. Runs after every commit, since any commit may be the one before a
 * key change. An undefined key opts out.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';

export function useContentKeySlide(
  bodyRef: RefObject<HTMLElement | null>,
  contentKey: string | undefined,
): void {
  const lastKey = useRef(contentKey);
  const lastHeight = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (contentKey === undefined) return;
    const body = bodyRef.current;
    const from = lastHeight.current;
    const changed = contentKey !== lastKey.current;
    lastKey.current = contentKey;
    lastHeight.current = body?.getBoundingClientRect().height ?? null;
    if (!body || !changed || from === null) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const style = getComputedStyle(body);
    body.animate(
      [
        { blockSize: `${from}px`, overflow: 'clip' },
        { blockSize: 'auto', overflow: 'clip' },
      ],
      {
        duration: parseFloat(style.getPropertyValue('--duration-base')),
        easing: style.getPropertyValue('--ease-standard'),
      },
    );
  });
}
