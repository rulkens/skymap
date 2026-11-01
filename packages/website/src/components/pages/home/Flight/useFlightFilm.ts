/*
 * useFlightFilm — the film that plays over the stills. Where the pre-paint
 * script set `data-flight-film` it is attached after load, and `show` seeks it
 * to the pose each frame. A missing or undecodable film leaves the stills,
 * which are already the page, so nothing here changes layout.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import { FILM_QUERY } from './filmQuery.ts';

// Half a film frame, so a seek to a stop's time lands on that frame and not the one before.
const HALF_FRAME = 1 / 48;

export function useFlightFilm(
  video: RefObject<HTMLVideoElement | null>,
  url: string,
): (sec: number, endSec: number) => boolean {
  const loaded = useRef(false);
  const fits = useRef<MediaQueryList>(null);

  useEffect(() => {
    const film = video.current!;
    fits.current = matchMedia(FILM_QUERY);
    const attach = (): void => {
      if (film.src || !document.documentElement.hasAttribute('data-flight-film')) return;
      film.addEventListener('loadeddata', () => (loaded.current = true), { once: true });
      film.addEventListener('error', () => {
        loaded.current = false;
        film.removeAttribute('data-playing');
      });
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = new URL(url, location.href).origin;
      document.head.append(link);
      film.preload = 'auto';
      film.src = url;
    };
    const afterPaint = (): void => {
      requestAnimationFrame(() => setTimeout(attach, 0));
    };
    if (document.readyState === 'complete') afterPaint();
    else addEventListener('load', afterPaint, { once: true });
    return () => removeEventListener('load', afterPaint);
  }, [video, url]);

  // True when the film is what the stage shows; `endSec` is the last second the flight reaches.
  return useCallback(
    (sec, endSec) => {
      const film = video.current!;
      const showing = loaded.current && fits.current!.matches;
      const target = Math.min(sec + HALF_FRAME, endSec);
      if (showing && !film.seeking && Math.abs(film.currentTime - target) > 0.02) {
        film.currentTime = target;
      }
      film.toggleAttribute('data-playing', showing);
      return showing;
    },
    [video],
  );
}
