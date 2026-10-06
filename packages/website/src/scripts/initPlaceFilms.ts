/*
 * initPlaceFilms — the short film inside a place's disc (components/Places.astro).
 * A link that has one carries its two addresses (`data-webm`, `data-mp4`); the
 * <video> is only made the first time that place is pointed at, focused from
 * the keyboard or, on a screen that cannot hover, scrolled to the middle. So
 * a visitor who does none of that fetches nothing, and neither does one who
 * asked for less data or less motion. One film plays at a time; a film that
 * stops stays on the frame it reached and goes on from there. While it plays,
 * `--turn` on the link is how far through the loop it is (0 to 1).
 */
const DWELL_MS = 350;

export function initPlaceFilms(root: HTMLElement): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const films = new Map<HTMLElement, HTMLVideoElement>();
  let current: HTMLElement | null = null;
  let frame = 0;

  const filmOf = (link: HTMLElement): HTMLVideoElement => {
    const made = films.get(link);
    if (made) return made;
    const film = document.createElement('video');
    film.muted = true;
    film.loop = true;
    film.playsInline = true;
    film.disableRemotePlayback = true;
    film.tabIndex = -1;
    film.setAttribute('aria-hidden', 'true');
    for (const [type, src] of [
      ['video/webm; codecs="av01.0.01M.08"', link.dataset.webm],
      ['video/mp4', link.dataset.mp4],
    ] as const) {
      const source = document.createElement('source');
      source.type = type;
      source.src = src!;
      film.append(source);
    }
    // Shown only once it has a frame to show, so the still never gives way to an empty box.
    film.addEventListener('playing', () => link.setAttribute('data-film', ''), { once: true });
    link.querySelector('[data-screen]')!.append(film);
    films.set(link, film);
    return film;
  };

  const stop = (): void => {
    if (!current) return;
    films.get(current)?.pause();
    current.removeAttribute('data-playing');
    cancelAnimationFrame(frame);
    current = null;
  };

  const play = (link: HTMLElement): void => {
    if (current === link) return;
    stop();
    current = link;
    const film = filmOf(link);
    link.setAttribute('data-playing', '');
    // Rejected when the film is stopped before it starts; nothing to do about it.
    film.play().catch(() => {});
    const follow = (): void => {
      if (film.duration)
        link.style.setProperty('--turn', (film.currentTime / film.duration).toFixed(4));
      frame = requestAnimationFrame(follow);
    };
    follow();
  };

  const links = [...root.querySelectorAll<HTMLElement>('a[data-webm]')];
  if (matchMedia('(hover: hover)').matches) {
    for (const link of links) {
      link.addEventListener('pointerenter', () => play(link));
      link.addEventListener('pointerleave', () => current === link && stop());
      link.addEventListener('focus', () => link.matches(':focus-visible') && play(link));
      link.addEventListener('blur', () => current === link && stop());
    }
    return;
  }

  // No hover: the film belongs to the disc crossing a band across the middle of the screen.
  const byDisc = new Map<Element, HTMLElement>(
    links.map((link) => [link.querySelector('[data-screen]')!, link]),
  );
  const inBand = new Set<HTMLElement>();
  let dwell = 0;
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const link = byDisc.get(entry.target)!;
        if (entry.isIntersecting) inBand.add(link);
        else inBand.delete(link);
      }
      const next = links.find((link) => inBand.has(link));
      clearTimeout(dwell);
      if (!next) stop();
      // A disc has to rest there a moment: scrolling straight past fetches nothing.
      else if (next !== current) dwell = window.setTimeout(() => play(next), DWELL_MS);
    },
    { rootMargin: '-42% 0px -42% 0px' },
  );
  for (const disc of byDisc.keys()) watcher.observe(disc);
}
