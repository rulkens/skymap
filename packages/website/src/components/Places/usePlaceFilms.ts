/*
 * usePlaceFilms — which place's film plays. A film is only made the first time
 * its place is pointed at, focused from the keyboard or, on a screen that cannot
 * hover, scrolled to the middle (`mode`), so a visitor who does none of that
 * fetches nothing, and neither does one who asked for less data or less motion
 * (`mode` stays 'off'). One film plays at a time: `current` is its place.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { lessWanted } from '../../utils/lessWanted.ts';

const DWELL_MS = 350;

type Mode = 'off' | 'hover' | 'band';

type PlaceFilms = {
  mode: Mode;
  current: string | null;
  play: (id: string) => void;
  stop: (id: string) => void;
  /** Each disc's screen, by place, for the band a no-hover screen plays from. */
  screens: RefObject<Map<string, HTMLElement>>;
};

export function usePlaceFilms(ids: readonly string[]): PlaceFilms {
  const [mode, setMode] = useState<Mode>('off');
  const [current, setCurrent] = useState<string | null>(null);
  const screens = useRef(new Map<string, HTMLElement>());
  const playing = useRef<string | null>(null);
  playing.current = current;

  const play = useCallback((id: string) => setCurrent(id), []);
  const stop = useCallback((id: string) => setCurrent((now) => (now === id ? null : now)), []);

  useEffect(() => {
    const less = lessWanted();
    if (less.data || less.motion) return;
    setMode(matchMedia('(hover: hover)').matches ? 'hover' : 'band');
  }, []);

  // No hover: the film belongs to the disc crossing a band across the middle of the screen.
  useEffect(() => {
    if (mode !== 'band') return;
    const byScreen = new Map<Element, string>(
      [...screens.current].map(([id, screen]) => [screen, id]),
    );
    const inBand = new Set<string>();
    let dwell = 0;
    const watch = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = byScreen.get(entry.target)!;
          if (entry.isIntersecting) inBand.add(id);
          else inBand.delete(id);
        }
        const next = ids.find((id) => inBand.has(id));
        clearTimeout(dwell);
        if (!next) setCurrent(null);
        // A disc has to rest there a moment: scrolling straight past fetches nothing.
        else if (next !== playing.current)
          dwell = window.setTimeout(() => setCurrent(next), DWELL_MS);
      },
      { rootMargin: '-42% 0px -42% 0px' },
    );
    for (const screen of byScreen.keys()) watch.observe(screen);
    return () => {
      clearTimeout(dwell);
      watch.disconnect();
    };
  }, [mode, ids]);

  return { mode, current, play, stop, screens };
}
