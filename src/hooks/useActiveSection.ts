/**
 * useActiveSection — which of a scroller's child sections is being read, and a jump to one.
 * The section being read is the last whose top has passed a reading line near the top of
 * whatever box scrolls it (the notes column on desktop, the page on a phone), or the last
 * section once that box is scrolled to its end. A jump holds its section until the reader
 * scrolls by hand: a short last section can't reach the line, so the scroll position alone
 * would land the highlight one section past the one picked.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** CSS px below the scroller's visible top: a heading here is the one being read. */
const READING_LINE_PX = 48;
const AT_END_SLACK_PX = 2;

export function useActiveSection(
  scrollerRef: RefObject<HTMLElement | null>,
): readonly [number, (index: number) => void] {
  const [active, setActive] = useState(0);
  const held = useRef(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = (e: Event): void => {
      const box = e.target instanceof Element ? e.target : document.scrollingElement;
      if (held.current || !box?.contains(scroller)) return;
      const sections = [...scroller.children];
      const line = Math.max(scroller.getBoundingClientRect().top, 0) + READING_LINE_PX;
      let next = 0;
      sections.forEach((s, i) => {
        if (s.getBoundingClientRect().top <= line) next = i;
      });
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - AT_END_SLACK_PX) {
        next = sections.length - 1;
      }
      setActive(Math.max(next, 0));
    };
    const release = (): void => {
      held.current = false;
    };
    const opts = { capture: true, passive: true };
    document.addEventListener('scroll', onScroll, opts);
    for (const type of ['wheel', 'touchmove', 'keydown'])
      document.addEventListener(type, release, opts);
    return () => {
      document.removeEventListener('scroll', onScroll, opts);
      for (const type of ['wheel', 'touchmove', 'keydown']) {
        document.removeEventListener(type, release, opts);
      }
    };
  }, [scrollerRef]);

  const jumpTo = useCallback(
    (index: number): void => {
      held.current = true;
      setActive(index);
      // No behaviour given, so each scrolling box's own `scroll-behavior` decides: smooth,
      // or instant under reduced motion.
      scrollerRef.current?.children[index]?.scrollIntoView({ block: 'start' });
    },
    [scrollerRef],
  );

  return [active, jumpTo];
}
